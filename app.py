import os
import sys
import secrets
import sqlite3
import uuid
from datetime import datetime, timedelta

for i in ['flask', 'flask_socketio', 'flask_login', 'eventlet','werkzeug']:
    try:
        __import__(i.replace('-', '_'))
    except:
        os.system(f'{sys.executable} -m pip install {i}')

from flask import Flask, render_template, request, redirect, url_for, flash, make_response, jsonify
from flask_socketio import SocketIO, emit
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
import eventlet

# Database setup
def init_db():
    conn = sqlite3.connect('storage.db')
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS players (
            player_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL,
            last_seen TEXT NOT NULL,
            x REAL DEFAULT 400,
            y REAL DEFAULT 225,
            rotation REAL DEFAULT 0,
            health INTEGER DEFAULT 100
        )
    ''')
    conn.commit()
    conn.close()

init_db()

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', secrets.token_hex(32))
app.config['REMEMBER_COOKIE_DURATION'] = timedelta(days=28)

# CRITICAL: Configure SocketIO properly for production
logger = False

socketio = SocketIO(app, 
                    cors_allowed_origins="*",
                    async_mode="eventlet",
                    logger=logger,
                    engineio_logger=logger,
                    ping_timeout=60,
                    ping_interval=25)

# Initialize Flask-Login
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# Store users and active players
users = {}
players = {}
# Map socket IDs to player IDs
sid_to_player = {}

class User(UserMixin):
    def __init__(self, id, username):
        self.id = id
        self.username = username

@login_manager.user_loader
def load_user(user_id):
    return users.get(user_id)

# Database helper functions
def get_player_from_db(player_id):
    conn = sqlite3.connect('storage.db')
    c = conn.cursor()
    c.execute('SELECT * FROM players WHERE player_id = ?', (player_id,))
    result = c.fetchone()
    conn.close()
    
    if result:
        return {
            'player_id': result[0],
            'name': result[1],
            'created_at': result[2],
            'last_seen': result[3],
            'x': result[4],
            'y': result[5],
            'rotation': result[6],
            'health': result[7]
        }
    return None

def save_player_to_db(player_id, player_data):
    conn = sqlite3.connect('storage.db')
    c = conn.cursor()
    
    now = datetime.now().isoformat()
    
    c.execute('''
        INSERT OR REPLACE INTO players 
        (player_id, name, created_at, last_seen, x, y, rotation, health)
        VALUES (?, ?, COALESCE((SELECT created_at FROM players WHERE player_id = ?), ?), ?, ?, ?, ?, ?)
    ''', (
        player_id,
        player_data['name'],
        player_id,
        now,
        now,
        player_data.get('x', 400),
        player_data.get('y', 225),
        player_data.get('rotation', 0),
        player_data.get('health', 100)
    ))
    
    conn.commit()
    conn.close()

# Routes
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/create-player', methods=['POST'])
def create_player():
    data = request.json
    name = data.get('name', '').strip()
    
    if not name or name.lower() == 'none':
        return jsonify({'error': 'Invalid name'}), 400
    
    # Generate new player ID
    player_id = str(uuid.uuid4())
    
    # Create player record
    player_data = {
        'name': name,
        'x': 400,
        'y': 225,
        'rotation': 0,
        'health': 100
    }
    
    save_player_to_db(player_id, player_data)
    
    # Create response with cookie
    response = make_response(jsonify({
        'player_id': player_id,
        'player_data': player_data
    }))
    
    # Set 30-day cookie
    response.set_cookie(
        'player_id',
        player_id,
        max_age=30*24*60*60,  # 30 days in seconds
        httponly=True,
        samesite='Lax'
    )
    
    return response

@app.route('/api/get-player', methods=['GET'])
def get_player():
    player_id = request.cookies.get('player_id')
    
    if not player_id:
        return jsonify({'error': 'No player ID found'}), 404
    
    player_data = get_player_from_db(player_id)
    
    if not player_data:
        return jsonify({'error': 'Player not found'}), 404
    
    # Refresh cookie
    response = make_response(jsonify({
        'player_id': player_id,
        'player_data': player_data
    }))
    
    response.set_cookie(
        'player_id',
        player_id,
        max_age=30*24*60*60,
        httponly=True,
        samesite='Lax'
    )
    
    return response

@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        remember = True
        
        # Find user
        user = None
        for u in users.values():
            if u.username == username:
                user = u
                break
        
        if user and check_password_hash(user.password_hash, password):
            login_user(user, remember=remember)
            next_page = request.args.get('next')
            return redirect(next_page or url_for('index'))
        else:
            flash('Invalid username or password')
    
    return render_template('login.html')

# SocketIO Events
@socketio.on('connect')
def handle_connect():
    print(f'Client connected: {request.sid}')

@socketio.on('player_join')
def handle_join(data):
    socket_id = request.sid
    player_id = data.get('player_id')
    
    if not player_id:
        emit('error', {'message': 'No player ID provided'})
        return
    
    # Verify player exists in database
    player_db_data = get_player_from_db(player_id)
    if not player_db_data:
        emit('error', {'message': 'Invalid player ID'})
        return
    
    # Map socket ID to player ID
    sid_to_player[socket_id] = player_id
    
    # Store active player data with socket_id as key for broadcasting
    players[socket_id] = {
        'x': data.get('x', player_db_data['x']),
        'y': data.get('y', player_db_data['y']),
        'rotation': data.get('rotation', player_db_data['rotation']),
        'name': player_db_data['name'],
        'health': data.get('health', player_db_data['health']),
        'sid': socket_id,
        'player_id': player_id
    }
    
    print(f'Player joined: {player_db_data["name"]} ({player_id}) - Socket: {socket_id}')
    print(f'Total players: {len(players)}')
    
    # Send all existing players to the new player
    emit('players_update', players)
    
    # Broadcast the new player to everyone else
    emit('players_update', players, broadcast=True, include_self=False)

@socketio.on('player_move')
def handle_move(data):
    socket_id = request.sid
    if socket_id in players:
        players[socket_id].update({
            'x': data['x'],
            'y': data['y'],
            'rotation': data['rotation'],
            'health': data['health'],
            'action': data.get('action', 'idle'),
            'scale': data.get('scale', 1)
        })
        emit('players_update', players, broadcast=True, include_self=False)

@socketio.on('projectile_fired')
def handle_projectile_fired(data):
    socket_id = request.sid
    print(f'Projectile fired by {socket_id}: {data}')
    
    emit('projectile_fired', {
        'x': data['x'],
        'y': data['y'],
        'rotation': data['rotation'],
        'speed': data['speed'],
        'damage': data['damage'],
        'ownerId': socket_id
    }, broadcast=True, include_self=False)

@socketio.on('health_update')
def handle_health_update(data):
    socket_id = request.sid
    print(f'Health update from {socket_id}: {data}')
    
    if socket_id in players:
        players[socket_id]['health'] = data['health']
    
    emit('player_health_update', {
        'playerId': socket_id,
        'health': data['health']
    }, broadcast=True, include_self=False)

@socketio.on('played_death')
def handle_death(data):
    socket_id = request.sid
    if socket_id in players:
        print(f'Player died: {players[socket_id]["name"]} ({socket_id})')
        emit('player_died', {
            'playerId': socket_id,
            'assistable_a': data.get('assistable_a', []),
            'assistable_b': data.get('assistable_b', []),
            'killerId': data.get('killerId', None)
        }, broadcast=True, include_self=False)

@socketio.on('disconnect')
def handle_disconnect():
    socket_id = request.sid
    
    if socket_id in players:
        player_data = players[socket_id]
        print(f'Player disconnected: {player_data["name"]} ({socket_id})')
        
        # Save player state to database
        if socket_id in sid_to_player:
            player_id = sid_to_player[socket_id]
            save_player_to_db(player_id, player_data)
            del sid_to_player[socket_id]
        
        del players[socket_id]
        emit('players_update', players, broadcast=True)

if __name__ == '__main__':
    socketio.run(app, debug=True, host='0.0.0.0', port=80, allow_unsafe_werkzeug=True)