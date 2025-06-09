import React, { useState } from 'react';
import axios from 'axios';
document.querySelector('#signup').addEventListener('submit', function (e) {
    const button = this.querySelector('.submit-button');
    const buttonText = button.querySelector('.button-text');
    const loading = button.querySelector('.loading');

    buttonText.style.opacity = '0';
    loading.style.display = 'block';
    button.style.pointerEvents = 'none';

    // 🥳 Trigger confetti
    setTimeout(() => {
        confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 }
        });
    }, 500);
});

export default function Login() {
    const [formData, setFormData] = useState({
        email: '',
        password: ''
    });

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const response = await axios.post('/login', formData);
            if (response.status === 200) {
                window.location.href = '/dashboard';
            }
        } catch (error) {
            console.error('Login failed:', error);
            alert('Login failed. Please check your credentials.');
        }
    };

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    };

    return (
        <div className="login-container">
            <form onSubmit={handleSubmit}>
                <h2>Login</h2>
                <input
                    type="email"
                    name="email"
                    placeholder="Email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                />
                <input
                    type="password"
                    name="password"
                    placeholder="Password"
                    value={formData.password}
                    onChange={handleChange}
                    required
                />
                <button type="submit">Login</button>
            </form>
        </div>
    );
}