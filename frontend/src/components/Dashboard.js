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
                <p>Email: {user.email}</p>
                <p>Status: {user.is_admin ? 'Admin' : 'User'}</p>
            </main>
        </div>
    );
}
