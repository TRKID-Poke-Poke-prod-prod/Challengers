import os
import sys
import secrets

for i in ['flask', 'flask_socketio', 'flask_login', 'eventlet','werkzeug']:
    try:
        __import__(i.replace('-', '_'))
    except:
        os.system(f'{sys.executable} -m pip install {i}')

from flask import Flask, render_template, request, redirect, url_for, flash
from flask_socketio import SocketIO, emit
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import timedelta

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', secrets.token_hex(32))
app.config['REMEMBER_COOKIE_DURATION'] = timedelta(days=28)

# CRITICAL: Configure SocketIO properly for production
socketio = SocketIO(app, 
                    cors_allowed_origins="*",
                    async_mode='eventlet',
                    logger=True,
                    engineio_logger=True,
                    ping_timeout=60,
                    ping_interval=25)

# Initialize Flask-Login
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# Store users and players
users = {}
players = {}

class User(UserMixin):
    def __init__(self, id, username, password_hash):
        self.id = id
        self.username = username
        self.password_hash = password_hash

@login_manager.user_loader
def load_user(user_id):
    return users.get(user_id)

# Routes
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        remember = request.form.get('remember', False) == 'on'
        
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

@app.route('/register', methods=['POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    
    username = request.form.get('username')
    password = request.form.get('password')
    
    # Check if user exists
    for u in users.values():
        if u.username == username:
            flash('Username already exists')
            return redirect(url_for('login'))
    
    # Create new user
    user_id = str(len(users) + 1)
    password_hash = generate_password_hash(password)
    user = User(user_id, username, password_hash)
    users[user_id] = user
    
    login_user(user, remember=True)
    return redirect(url_for('index'))

@app.route('/profile')
@login_required
def profile():
    return render_template('profile.html', username=current_user.username)

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('index'))

# SocketIO Events
@socketio.on('connect')
def handle_connect():
    print(f'Client connected: {request.sid}')

@socketio.on('player_join')
def handle_join(data):
    player_id = request.sid
    
    # Use authenticated username if available, otherwise use provided name
    player_name = data.get('name', 'Guest')
    
    players[player_id] = {
        'x': data['x'],
        'y': data['y'],
        'rotation': data['rotation'],
        'name': player_name,
        'sid': player_id
    }
    
    print(f'Player joined: {player_name} ({player_id})')
    emit('players_update', players, broadcast=True)

@socketio.on('player_move')
def handle_move(data):
    player_id = request.sid
    if player_id in players:
        players[player_id].update({
            'x': data['x'],
            'y': data['y'],
            'rotation': data['rotation']
        })
        emit('players_update', players, broadcast=True)

@socketio.on('disconnect')
def handle_disconnect():
    player_id = request.sid
    if player_id in players:
        print(f'Player disconnected: {players[player_id]["name"]} ({player_id})')
        del players[player_id]
        emit('players_update', players, broadcast=True)

if __name__ == '__main__':
    socketio.run(app, debug=True, host='0.0.0.0', port=80, allow_unsafe_werkzeug=True)
