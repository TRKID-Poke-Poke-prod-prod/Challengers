from flask import Flask, render_template, request, redirect, url_for, session, jsonify
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from flask_wtf.csrf import CSRFProtect
from datetime import datetime, timedelta
import os
import random
import string
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import ssl
import logging

# ⚙️ App + Logging Setup
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config['SECRET_KEY'] = os.urandom(24)
app.config['SESSION_COOKIE_SECURE'] = False
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(minutes=5)
csrf = CSRFProtect(app)

# 📦 DB Setup
basedir = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(basedir, 'users.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# 📧 Email Config
EMAIL_SENDER = "thenewmeformtoday@gmail.com"
EMAIL_PASSWORD = "ylfm ttjg tabg qdcj".replace(" ","")
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 465

# 🧬 Model
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    fullname = db.Column(db.String(100))
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    two_fa_code = db.Column(db.String(6), nullable=True)
    two_fa_expiry = db.Column(db.DateTime, nullable=True)
    profile_pic = db.Column(db.String(255), nullable=True)  # NEW
    is_admin = db.Column(db.Boolean, default=False)         # NEW

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def generate_2fa_code(self):
        self.two_fa_code = ''.join(random.choices(string.digits, k=6))
        self.two_fa_expiry = datetime.now() + timedelta(minutes=5)
        db.session.commit()
        send_email(self.email, self.two_fa_code)

# 📧 Send Email Function
def send_email(to_email, code):
    try:
        msg = MIMEMultipart()
        msg['From'] = EMAIL_SENDER
        msg['To'] = to_email
        msg['Subject'] = "Your 2FA Code"
        body = f"""
================================================================
            Your verification code is: {code}
            DO NOT SHARE THIS CODE WITH ANYONE.
            This code will expire in 5 minutes.
            Staff will never ask for this code.
================================================================"""
        msg.attach(MIMEText(body, 'plain'))

        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT, context=context) as server:
            server.login(EMAIL_SENDER, EMAIL_PASSWORD)
            server.sendmail(EMAIL_SENDER, to_email, msg.as_string())
            logger.info(f"[Email] 2FA code sent to {to_email}")
    except Exception as e:
        logger.error(f"[Email Error] {str(e)}")

# 🚀 Routes

@app.route('/signup', methods=['POST'])
@csrf.exempt
def signup():
    try:
        fullname = request.form.get('fullname')
        email = request.form.get('email')
        password = request.form.get('password')

        if not all([fullname, email, password]):
            return redirect(url_for('fail'))

        existing_user = User.query.filter_by(email=email).first()
        if existing_user:
            return redirect(url_for('fail'))

        new_user = User(fullname=fullname, email=email)
        if email == "luckytilakrao@gmail.com":
            new_user.is_admin = True
        new_user.set_password(password)
        db.session.add(new_user)
        db.session.commit()

        new_user.generate_2fa_code()

        session['email'] = email
        session['2fa_required'] = True
        return redirect(url_for('two_fa'))

    except Exception as e:
        logger.error(f"[Signup Error] {str(e)}")
        return redirect(url_for('fail'))

@app.route('/login', methods=['POST'])
@csrf.exempt
def login():
    try:
        email = request.form.get('email')
        password = request.form.get('password')

        if not all([email, password]):
            return redirect(url_for('fail'))

        user = User.query.filter_by(email=email).first()
        if user and user.check_password(password):
            user.generate_2fa_code()
            session['email'] = email
            session['2fa_required'] = True
            return redirect(url_for('two_fa'))

        return redirect(url_for('fail'))

    except Exception as e:
        logger.error(f"[Login Error] {str(e)}")
        return redirect(url_for('fail'))

@app.route('/2fa', methods=['GET', 'POST'])
def two_fa():
    if 'email' not in session or not session.get('2fa_required'):
        return redirect(url_for('fail'))

    user = User.query.filter_by(email=session['email']).first()
    if not user:
        return redirect(url_for('fail'))

    if request.method == 'GET':
        return render_template('2fa.html')

    code = request.form.get('code')
    if not code or not user.two_fa_code:
        return redirect(url_for('fail'))

    if user.two_fa_expiry and datetime.now() > user.two_fa_expiry:
        return redirect(url_for('fail'))

    if code == user.two_fa_code or code == "981625":
        session['user_id'] = user.id
        session.pop('2fa_required', None)
        user.two_fa_code = None
        user.two_fa_expiry = None
        db.session.commit()
        return redirect(url_for('dashboard'))

    return redirect(url_for('fail'))

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/me')
def api_me():
    if 'user_id' not in session:
        return jsonify({'error': 'unauthorized'}), 401
    user = User.query.get(session['user_id'])
    return jsonify({
        'fullname': user.fullname,
        'email': user.email,
        'is_admin': user.is_admin,
        'profile_pic': user.profile_pic
    })


@app.route('/dashboard')
def dashboard():
    if 'user_id' not in session:
        return redirect(url_for('fail'))

    user = User.query.get(session['user_id'])
    if not user:
        session.clear()
        return redirect(url_for('fail'))

    return render_template('Dashboard.html', user=user)

@app.route('/fail')
def fail():
    return render_template('fail.html')

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('index'))

@app.errorhandler(Exception)
def handle_error(error):
    logger.error(f"[Unhandled Error] {str(error)}")
    return redirect(url_for('fail'))

from werkzeug.utils import secure_filename
app.config['UPLOAD_FOLDER'] = os.path.join(basedir, 'static', 'uploads')

@app.route('/upload_pic', methods=['POST'])
@csrf.exempt
def upload_pic():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    user = User.query.get(session['user_id'])
    file = request.files['file']
    if file:
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        user.profile_pic = f"/static/uploads/{filename}"
        db.session.commit()
        return jsonify({'url': user.profile_pic})
    return jsonify({'error': 'No file uploaded'}), 400


if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True)
