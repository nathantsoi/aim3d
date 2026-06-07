#!/usr/bin/env bash
set -e

echo "Installing dependencies for JetPack 7.2 (Ubuntu 24.04)..."
sudo apt-get update
sudo apt-get install -y gcc-arm-none-eabi make python3-pip python3-venv

echo "Compiling SPE Firmware..."
cd ../firmware/spe
make clean
make all

echo "Deploying firmware..."
sudo cp aim3d_spe.bin /lib/firmware/
# In a real scenario, we'd also modify extlinux.conf or flash the DTB here to enable IVC and define the memory region.

echo "Setting up Python daemon..."
cd ../../python
python3 -m venv .venv
source .venv/bin/activate
pip install -e .

echo "Creating systemd service..."
cat << 'EOF' | sudo tee /etc/systemd/system/aim3d.service
[Unit]
Description=aim3d Controller Daemon
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/aim3d/python
ExecStart=/opt/aim3d/python/.venv/bin/python -m aim3d.daemon
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable aim3d

echo "Installation complete."
