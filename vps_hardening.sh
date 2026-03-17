#!/bin/bash
# VPS Security Hardening Script for Ubuntu 24.04
# Run as root: sudo bash vps_hardening.sh

set -e

echo "Starting VPS Hardening..."

# 1. Update System
echo "Updating system packages..."
apt update && apt upgrade -y

# 2. Install essential tools
echo "Installing Fail2Ban, UFW, and unattended-upgrades..."
apt install -y fail2ban ufw unattended-upgrades lynis

# 3. Create sudo user
read -p "Digite o nome do novo usuário sudo: " NEWUSER
if id "$NEWUSER" &>/dev/null; then
    echo "Usuário $NEWUSER já existe. Pulando criação."
else
    adduser $NEWUSER
    usermod -aG sudo $NEWUSER
    echo "Usuário $NEWUSER criado e adicionado ao grupo sudo."
fi

# 4. Configure SSH (Assuming user logs in via SSH key later)
echo "Hardening SSH..."
# Backup original config
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak

# Recommended Settings
sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
# Note: Changing port is optional. If you want to change it, uncomment next line:
# sed -i 's/#Port 22/Port 2222/' /etc/ssh/sshd_config

systemctl restart ssh

# 5. Configure UFW
echo "Configuring Firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
# ufw allow 2222/tcp # Uncomment if port changed
ufw allow 80/tcp
ufw allow 443/tcp
echo "y" | ufw enable

# 6. Configure Fail2Ban
echo "Configuring Fail2Ban..."
cat <<EOF > /etc/fail2ban/jail.local
[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 1h
EOF
systemctl restart fail2ban

# 7. Secure Shared Memory
echo "Securing shared memory..."
if ! grep -q "tmpfs /run/shm" /etc/fstab; then
    echo "tmpfs /run/shm tmpfs defaults,noexec,nosuid 0 0" >> /etc/fstab
fi

# 8. Enable Unattended Upgrades
echo "Enabling unattended-upgrades..."
dpkg-reconfigure -plow unattended-upgrades

echo "VPS Hardening Complete! Please verify login with your non-root user before disconnecting."
