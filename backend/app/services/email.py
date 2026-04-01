"""
Email service for sending verification emails.
Currently supports console output (for development) and SMTP (for production).
"""
import secrets
from typing import Optional
from urllib.parse import urlencode
from app.core.config import settings


class EmailService:
    def __init__(self):
        self.smtp_host = settings.SMTP_HOST.strip()
        self.smtp_port = settings.SMTP_PORT
        self.smtp_user = settings.SMTP_USER.strip()
        self.smtp_password = settings.SMTP_PASSWORD
        self.smtp_from = settings.SMTP_FROM
        self.frontend_public_url = settings.FRONTEND_PUBLIC_URL.rstrip("/")
        self.is_dev_mode = not self.smtp_host

    def _build_frontend_url(self, path: str, query: Optional[dict[str, str]] = None) -> str:
        normalized_path = path if path.startswith("/") else f"/{path}"
        if query:
            return f"{self.frontend_public_url}{normalized_path}?{urlencode(query)}"
        return f"{self.frontend_public_url}{normalized_path}"

    def generate_verification_token(self) -> str:
        """Generate a secure verification token."""
        return secrets.token_urlsafe(32)

    def send_verification_email(self, email: str, token: str) -> bool:
        """Send email verification link to user."""
        verification_url = self._build_frontend_url("/verify-email", {"token": token})

        subject = "【Engarde AI】请验证你的邮箱"
        body = f"""
欢迎注册 Engarde AI！

请点击下方链接完成邮箱验证：

{verification_url}

该链接 24 小时内有效。

如果这不是你的操作，请忽略本邮件。

Engarde AI 团队
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

            if self.smtp_port == 465:
                # Port 465 uses implicit TLS (SMTPS).
                server = smtplib.SMTP_SSL(self.smtp_host, self.smtp_port, timeout=20)
            else:
                # Other ports (for example 587) use explicit STARTTLS.
                server = smtplib.SMTP(self.smtp_host, self.smtp_port, timeout=20)
                server.ehlo()
                server.starttls()
                server.ehlo()

            server.login(self.smtp_user, self.smtp_password)
            server.send_message(msg)
            server.quit()

            print(f"✅ Email sent to {to_email}")
            return True

        except Exception as e:
            print(f"❌ Failed to send email: {e}")
            return False

    def send_password_reset_email(self, email: str, token: str) -> bool:
        """Send password reset link to user."""
        reset_url = self._build_frontend_url("/reset-password", {"token": token})

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
