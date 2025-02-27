#!/bin/bash

# Create certs directory if it doesn't exist
mkdir -p certs

# Generate self-signed certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout certs/localhost-key.pem \
  -out certs/localhost.pem \
  -subj "/C=US/ST=State/L=City/O=Organization/OU=Unit/CN=localhost"

# Set permissions
chmod 600 certs/localhost-key.pem
chmod 600 certs/localhost.pem

echo "SSL certificate generated successfully!"
echo "Note: You may need to add this certificate to your system/browser trusted certificates." 