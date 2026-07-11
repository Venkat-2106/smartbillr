import secrets

webhook_secret = secrets.token_hex(32)  # 64-character random hex string
print(webhook_secret)