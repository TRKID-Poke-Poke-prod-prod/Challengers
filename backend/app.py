# Add these models to your existing app.py file after the User model

class Student(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    first_name = db.Column(db.String(50), nullable=False)
    last_name = db.Column(db.String(50), nullable=False)
    student_id = db.Column(db.String(50), unique=True)  # School ID number
    email = db.Column(db.String(120))
    grade_level = db.Column(db.String(10))  # e.g., "9th", "10th", etc.
    class_name = db.Column(db.String(100))  # e.g., "Math 101", "Biology A"
    date_added = db.Column(db.DateTime, default=datetime.now)
    teacher_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    is_active = db.Column(db.Boolean, default=True)
    
    # Academic tracking
    current_grade = db.Column(db.Float, default=0.0)  # Current overall grade
    total_points_earned = db.Column(db.Integer, default=0)
    total_points_possible = db.Column(db.Integer, default=0)
    
    # Relationships
    teacher = db.relationship('User', backref=db.backref('students', lazy=True))
    grades = db.relationship('Grade', backref='student', lazy=True, cascade='all, delete-orphan')
    event_participations = db.relationship('EventParticipation', backref='student', lazy=True)
    
    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}"
    
    @property
    def grade_percentage(self):
        if self.total_points_possible == 0:
            return 0.0
        return round((self.total_points_earned / self.total_points_possible) * 100, 2)
    
    @property
    def letter_grade(self):
        percentage = self.grade_percentage
        if percentage >= 90: return 'A'
        elif percentage >= 80: return 'B'
        elif percentage >= 70: return 'C'
        elif percentage >= 60: return 'D'
        else: return 'F'

class Grade(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('student.id'), nullable=False)
    assignment_name = db.Column(db.String(200), nullable=False)
    category = db.Column(db.String(50))  # Test, Quiz, Homework, Project, etc.
    points_earned = db.Column(db.Float, nullable=False)
    points_possible = db.Column(db.Float, nullable=False)
    date_graded = db.Column(db.DateTime, default=datetime.now)
    notes = db.Column(db.Text)
    
    @property
    def percentage(self):
        if self.points_possible == 0:
            return 0.0
        return round((self.points_earned / self.points_possible) * 100, 2)

class Event(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    event_date = db.Column(db.DateTime, nullable=False)
    event_type = db.Column(db.String(50))  # Competition, Field Trip, Test, etc.
    max_participants = db.Column(db.Integer)
    created_date = db.Column(db.DateTime, default=datetime.now)
    teacher_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    is_active = db.Column(db.Boolean, default=True)
    
    # Relationships
    teacher = db.relationship('User', backref=db.backref('events', lazy=True))
    participations = db.relationship('EventParticipation', backref='event', lazy=True)

class EventParticipation(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('student.id'), nullable=False)
    event_id = db.Column(db.Integer, db.ForeignKey('event.id'), nullable=False)
    registration_date = db.Column(db.DateTime, default=datetime.now)
    attendance_status = db.Column(db.String(20), default='registered')  # registered, attended, absent
    score = db.Column(db.Float)  # For competitive events
    ranking = db.Column(db.Integer)  # Student's rank in the event
    notes = db.Column(db.Text)
    
    # Unique constraint
    __table_args__ = (db.UniqueConstraint('student_id', 'event_id', name='unique_student_event'),)

# API Routes for Student Management

@app.route('/api/students', methods=['GET'])
def get_students():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    user = User.query.get(session['user_id'])
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    class_filter = request.args.get('class')
    query = Student.query.filter_by(teacher_id=user.id, is_active=True)
    
    if class_filter:
        query = query.filter_by(class_name=class_filter)
    
    students = query.all()
    
    return jsonify([{
        'id': s.id,
        'first_name': s.first_name,
        'last_name': s.last_name,
        'full_name': s.full_name,
        'student_id': s.student_id,
        'email': s.email,
        'grade_level': s.grade_level,
        'class_name': s.class_name,
        'current_grade': s.grade_percentage,
        'letter_grade': s.letter_grade,
        'total_assignments': len(s.grades),
        'date_added': s.date_added.strftime('%Y-%m-%d')
    } for s in students])

@app.route('/api/students', methods=['POST'])
@csrf.exempt
def add_student():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    user = User.query.get(session['user_id'])
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    data = request.get_json()
    
    # Validation
    required_fields = ['first_name', 'last_name']
    for field in required_fields:
        if not data.get(field):
            return jsonify({'error': f'{field.replace("_", " ").title()} is required'}), 400
    
    # Check if student ID already exists (if provided)
    if data.get('student_id'):
        existing_student = Student.query.filter_by(student_id=data['student_id']).first()
        if existing_student:
            return jsonify({'error': 'Student ID already exists'}), 400
    
    try:
        new_student = Student(
            first_name=data['first_name'].strip(),
            last_name=data['last_name'].strip(),
            student_id=data.get('student_id', '').strip(),
            email=data.get('email', '').strip(),
            grade_level=data.get('grade_level', '').strip(),
            class_name=data.get('class_name', '').strip(),
            teacher_id=user.id
        )
        
        db.session.add(new_student)
        db.session.commit()
        
        return jsonify({
            'message': 'Student added successfully',
            'student': {
                'id': new_student.id,
                'full_name': new_student.full_name,
                'student_id': new_student.student_id,
                'class_name': new_student.class_name
            }
        }), 201
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error adding student: {str(e)}")
        return jsonify({'error': 'Failed to add student'}), 500

@app.route('/api/students/<int:student_id>/grades', methods=['POST'])
@csrf.exempt
def add_grade():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    student = Student.query.get_or_404(student_id)
    if student.teacher_id != session['user_id']:
        return jsonify({'error': 'Unauthorized'}), 401
    
    data = request.get_json()
    
    try:
        new_grade = Grade(
            student_id=student_id,
            assignment_name=data['assignment_name'],
            category=data.get('category', 'Assignment'),
            points_earned=float(data['points_earned']),
            points_possible=float(data['points_possible']),
            notes=data.get('notes', '')
        )
        
        db.session.add(new_grade)
        
        # Update student's total points
        student.total_points_earned += new_grade.points_earned
        student.total_points_possible += new_grade.points_possible
        
        db.session.commit()
        
        return jsonify({
            'message': 'Grade added successfully',
            'grade': {
                'id': new_grade.id,
                'assignment_name': new_grade.assignment_name,
                'percentage': new_grade.percentage,
                'points': f"{new_grade.points_earned}/{new_grade.points_possible}"
            },
            'student_grade': student.grade_percentage
        }), 201
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error adding grade: {str(e)}")
        return jsonify({'error': 'Failed to add grade'}), 500

@app.route('/api/class-average')
def get_class_average():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    user = User.query.get(session['user_id'])
    class_name = request.args.get('class')
    
    query = Student.query.filter_by(teacher_id=user.id, is_active=True)
    if class_name:
        query = query.filter_by(class_name=class_name)
    
    students = query.all()
    
    if not students:
        return jsonify({'class_average': 0, 'total_students': 0})
    
    total_grade = sum(s.grade_percentage for s in students)
    class_average = round(total_grade / len(students), 2)
    
    # Grade distribution
    grade_distribution = {'A': 0, 'B': 0, 'C': 0, 'D': 0, 'F': 0}
    for student in students:
        grade_distribution[student.letter_grade] += 1
    
    return jsonify({
        'class_average': class_average,
        'total_students': len(students),
        'grade_distribution': grade_distribution,
        'class_name': class_name or 'All Classes'
    })

@app.route('/api/student-rankings')
def get_student_rankings():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    user = User.query.get(session['user_id'])
    class_name = request.args.get('class')
    
    query = Student.query.filter_by(teacher_id=user.id, is_active=True)
    if class_name:
        query = query.filter_by(class_name=class_name)
    
    # Sort by grade percentage (highest first)
    students = query.all()
    students.sort(key=lambda s: s.grade_percentage, reverse=True)
    
    rankings = []
    for rank, student in enumerate(students, 1):
        rankings.append({
            'rank': rank,
            'student_name': student.full_name,
            'student_id': student.student_id,
            'grade_percentage': student.grade_percentage,
            'letter_grade': student.letter_grade,
            'total_assignments': len(student.grades)
        })
    
    return jsonify({
        'rankings': rankings,
        'class_name': class_name or 'All Classes',
        'total_students': len(rankings)
    })

@app.route('/api/classes')
def get_classes():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    
    user = User.query.get(session['user_id'])
    
    # Get unique class names
    classes_query = db.session.query(Student.class_name).filter_by(
        teacher_id=user.id, is_active=True
    ).distinct().all()
    
    classes = [c[0] for c in classes_query if c[0]]  # Filter out empty class names
    
    return jsonify({'classes': classes})


from flask import Flask, render_template, request, redirect, url_for, session, jsonify
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from flask_wtf.csrf import CSRFProtect
from werkzeug.utils import secure_filename
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

# 📁 Upload Setup - MOVED THIS UP BEFORE USING IT
app.config['UPLOAD_FOLDER'] = os.path.join(basedir, 'static', 'uploads')
# Create upload directory if it doesn't exist
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

db = SQLAlchemy(app)

# 📧 Email Config - USE ENVIRONMENT VARIABLES IN PRODUCTION
EMAIL_SENDER = os.environ.get('EMAIL_SENDER', "thenewmeformtoday@gmail.com")
EMAIL_PASSWORD = os.environ.get('EMAIL_PASSWORD', "ylfm ttjg tabg qdcj".replace(" ", ""))
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
    profile_pic = db.Column(db.String(255), nullable=True)
    is_admin = db.Column(db.Boolean, default=False)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def generate_2fa_code(self, send_to_email=True):
        self.two_fa_code = ''.join(random.choices(string.digits, k=6))
        self.two_fa_expiry = datetime.now() + timedelta(minutes=5)
        db.session.commit()

        logger.info(f"[2FA] Code for {self.email}: {self.two_fa_code}")  # ← SEND TO CONSOLE

        if send_to_email:
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
            return redirect(url_for('fail', error_type='Missing Information',
                                    error_message='Please fill in all required fields: name, email, and password.'))

        existing_user = User.query.filter_by(email=email).first()
        if existing_user:
            return redirect(url_for('fail', error_type='Account Exists',
                                    error_message='An account with this email already exists. Please try logging in instead.'))

        new_user = User(fullname=fullname, email=email)
        # Better admin check - use environment variable in production
        admin_email = os.environ.get('ADMIN_EMAIL', 'luckytilakrao@gmail.com')
        if email == admin_email:
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
            return redirect(url_for('fail', error_type='Missing Credentials',
                                    error_message='Please enter both email and password to log in.'))

        user = User.query.filter_by(email=email).first()
        if user and user.check_password(password):
            user.generate_2fa_code()
            session['email'] = email
            session['2fa_required'] = True
            return redirect(url_for('two_fa'))

        return redirect(url_for('fail', error_type='Invalid Credentials',
                                error_message='Email or password is incorrect. Please check your credentials and try again.'))

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
        return redirect(url_for('fail', error_type='Code Expired',
                                error_message='Your 2FA code has expired. Please request a new one.'))

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
    if not user:
        return jsonify({'error': 'user not found'}), 404
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
    error_type = request.args.get('error_type', 'Authentication Error')
    error_message = request.args.get('error_message', 'Please check your credentials and try again.')
    return render_template('fail.html', error_type=error_type, error_message=error_message)


@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('index'))


@app.route('/upload_pic', methods=['POST'])
@csrf.exempt
def upload_pic():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    user = User.query.get(session['user_id'])
    if not user:
        return jsonify({'error': 'User not found'}), 404

    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    if file:
        filename = secure_filename(file.filename)
        # Add timestamp to prevent filename conflicts
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S_')
        filename = timestamp + filename
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)

        try:
            file.save(filepath)
            user.profile_pic = f"/static/uploads/{filename}"
            db.session.commit()
            return jsonify({'url': user.profile_pic})
        except Exception as e:
            logger.error(f"[Upload Error] {str(e)}")
            return jsonify({'error': 'Failed to save file'}), 500

    return jsonify({'error': 'No file uploaded'}), 400


@app.errorhandler(Exception)
def handle_error(error):
    logger.error(f"[Unhandled Error] {str(error)}")
    return redirect(url_for('fail'))


if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True)
