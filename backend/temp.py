# Quick Database Fix Script
# Run this to update your database schema

from app import app, db
import os


def fix_database():
    # Delete the old database file
    db_path = os.path.join(os.path.dirname(__file__), 'users.db')
    if os.path.exists(db_path):
        os.remove(db_path)
        print("✅ Deleted old database")

    # Create new database with updated schema
    with app.app_context():
        db.create_all()
        print("✅ Created new database with updated schema")

    print("Database fix complete! You can now run your app.")


if __name__ == '__main__':
    fix_database()