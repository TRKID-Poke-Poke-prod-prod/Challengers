import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { getGravatar } from '../utils/gravatar';

export default function Dashboard() {
    const [user, setUser] = useState(null);

    useEffect(() => {
        axios.get('/api/me')  // Flask route returns logged in user info
            .then(res => setUser(res.data))
            .catch(() => window.location.href = "/login");
    }, []);



    if (!user) return <div>Loading...</div>;

    const avatar = user.profile_pic || getGravatar(user.email);

    return (
        <div className="dashboard">
            <header className="header">
                <div className="logo">Challengers</div>
                <div className="profile-container">
                    <img src={avatar} alt="profile" className="profile-picture" />
                    <div className="dropdown-menu">
                        <span>{user.fullname}</span>
                        {user.is_admin && <span>👑 Admin</span>}
                        <a href="/logout">Logout</a>
                    </div>
                </div>
            </header>

            <main>
                <h1>Welcome back, {user.fullname}!</h1>

                <div className="dashboard-options">
                    <div className="option-grid">
                        <button className="option-card">
                            <h3>👤 New Student</h3>
                            <p>Add a new student to your class</p>
                        </button>

                        <button className="option-card">
                            <h3>🎯 New Challenge</h3>
                            <p>Create a new challenge for your students</p>
                        </button>

                        <button className="option-card">
                            <h3>👥 Add Friends</h3>
                            <p>Connect with other teachers</p>
                        </button>

                        <button className="option-card">
                            <h3>🏆 Group Challenge</h3>
                            <p>Set up challenges for multiple classes</p>
                        </button>

                        <button className="option-card">
                            <h3>📥 Import Students</h3>
                            <p>Import students from CSV or other systems</p>
                        </button>
                    </div>
                </div>

                <div className="user-info">
                    <p>Email: {user.email}</p>
                    <p>Status: {user.is_admin ? 'Admin' : 'User'}</p>
                </div>
            </main>
        </div>
    );
}