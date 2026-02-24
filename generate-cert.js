// Generate self-signed SSL certificate for HTTPS
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Generate RSA key pair
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

// Create a self-signed certificate using Node.js
// We need to create the certificate manually using ASN.1
const forge_free_cert = () => {
    // Use the built-in crypto to create a self-signed cert
    const { X509Certificate } = crypto;

    // Generate using createCertificate-like approach
    const serialNumber = crypto.randomBytes(16).toString('hex');

    // We'll write the key and use a simple PEM cert approach
    const keyFile = path.join(__dirname, 'ssl-key.pem');
    const certFile = path.join(__dirname, 'ssl-cert.pem');

    fs.writeFileSync(keyFile, privateKey);

    // For a proper self-signed cert without OpenSSL, we need a library
    // Let's use the node:crypto createSign approach
    console.log('Private key generated: ssl-key.pem');
    console.log('To complete HTTPS setup, installing selfsigned package...');
};

forge_free_cert();
