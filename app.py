requirments = ['flask','flask_socketio']
import os, sys

for i in requirments:
    try:
        __import__(i)
    except:
        os.system(f'{sys.executable} -m pip install {i}')

from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app)

# Store connected players
players = {}

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('connect')
def handle_connect():
    print('Client connected')

@socketio.on('player_join')
def handle_join(data):
    player_id = request.sid
    players[player_id] = {
        'x': data['x'],
        'y': data['y'],
        'rotation': data['rotation'],
        'name': data['name']
    }
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
        del players[player_id]
        emit('players_update', players, broadcast=True)

if __name__ == '__main__':
    socketio.run(app, debug=True, host='0.0.0.0', port=80)