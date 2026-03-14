"""
Email service for sending verification emails.
Currently supports console output (for development) and SMTP (for production).
"""
import secrets
from datetime import datetime, timedelta
from typing import Optional
from app.core.config import settings


class EmailService:
    def __init__(self):
        self.smtp_host = getattr(settings, 'SMTP_HOST', None)
        self.smtp_port = getattr(settings, 'SMTP_PORT', 587)
        self.smtp_user = getattr(settings, 'SMTP_USER', None)
        self.smtp_password = getattr(settings, 'SMTP_PASSWORD', None)
        self.smtp_from = getattr(settings, 'SMTP_FROM', 'Engarde AI <noreply@engarde.ai>')
        self.is_dev_mode = not self.smtp_host

    def generate_verification_token(self) -> str:
        """Generate a secure verification token."""
        return secrets.token_urlsafe(32)

    def send_verification_email(self, email: str, token: str) -> bool:
        """Send email verification link to user."""
        verification_url = f"http://localhost:3001/verify-email?token={token}"

        subject = "Verify your Engarde AI account"
        body = f"""
Welcome to Engarde AI!

Please verify your email address by clicking the link below:

{verification_url}

This link will expire in 24 hours.

If you didn't create an account, please ignore this email.

Best regards,
Engarde AI Team
"""

        if self.is_dev_mode:
            # Console output for development
            print("\n" + "=" * 50)
            print("📧 EMAIL VERIFICATION (DEV MODE)")
            print("=" * 50)
            print(f"To: {email}")
            print(f"Subject: {subject}")
            print("-" * 50)
            print(body)
            print("=" * 50 + "\n")
            return True

        # Real SMTP sending
        return self._send_smtp_email(email, subject, body)

    def _send_smtp_email(self, to_email: str, subject: str, body: str) -> bool:
        """Send email via SMTP."""
        try:
            import smtplib
            from email.mime.text import MIMEText
            from email.mime.multipart import MIMEMultipart

            msg = MIMEMultipart()
            msg['From'] = self.smtp_from
            msg['To'] = to_email
            msg['Subject'] = subject

            msg.attach(MIMEText(body, 'plain'))

            server = smtplib.SMTP(self.smtp_host, self.smtp_port)
            server.starttls()
            server.login(self.smtp_user, self.smtp_password)
            server.send_message(msg)
            server.quit()

            print(f"✅ Email sent to {to_email}")
            return True

        except Exception as e:
            print(f"❌ Failed to send email: {e}")
            return False

    def send_welcome_email(self, email: str, username: str) -> bool:
        """Send welcome email after verification."""
        subject = "Welcome to Engarde AI!"
        body = f"""
Hi {username}!

Your email has been verified. Welcome to Engarde AI!

You can now:
- Upload and analyze your fencing videos
- Get AI-powered technique feedback
- Track your training progress

Get started at: http://localhost:3001/analyze

Best regards,
Engarde AI Team
"""

        if self.is_dev_mode:
            print("\n" + "=" * 50)
            print("📧 WELCOME EMAIL (DEV MODE)")
            print("=" * 50)
            print(f"To: {email}")
            print(f"Subject: {subject}")
            print("-" * 50)
            print(body)
            print("=" * 50 + "\n")
            return True

        return self._send_smtp_email(email, subject, body)


    def send_password_reset_email(self, email: str, token: str) -> bool:
        """Send password reset link to user."""
        reset_url = f"http://localhost:3001/reset-password?token={token}"

        subject = "Reset your Engarde AI password"
        body = f"""
You requested to reset your password.

Click the link below to create a new password:

{reset_url}

This link will expire in 1 hour.

If you didn't request a password reset, please ignore this email.

Best regards,
Engarde AI Team
"""

        if self.is_dev_mode:
            print("\n" + "=" * 50)
            print("📧 PASSWORD RESET (DEV MODE)")
            print("=" * 50)
            print(f"To: {email}")
            print(f"Subject: {subject}")
            print("-" * 50)
            print(body)
            print("=" * 50 + "\n")
            return True

        return self._send_smtp_email(email, subject, body)


# Singleton instance
email_service = EmailService()
