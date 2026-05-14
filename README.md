# Chess

Self-hosted chess: play Stockfish, play a friend online, review games with an engine.

## Run locally (Python)

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # edit STOCKFISH_PATH if needed
python wsgi.py
```

Open http://localhost:5001.

## Run with Docker Compose

```bash
docker compose up --build
```

Open http://localhost:8000. Stockfish is installed in the image at `/usr/games/stockfish`. SQLite and Redis volumes persist between runs.

> **Note:** `.env` is for local dev (`python wsgi.py`) only. Docker Compose hardcodes its container paths (`DATABASE_URL=/srv/data/chess.db`, `REDIS_URL=redis://redis:6379/0`) and ignores them in `.env`. If you previously copied `.env.example` and saw `sqlite3.OperationalError: unable to open database file`, that's why — pull the latest compose file and rebuild.

## Mount behind Caddy at a sub-path

If you want the app at `https://your-domain/chess` (e.g. alongside an existing landing page or naiveproxy setup), see [`deploy/Caddyfile.snippet`](deploy/Caddyfile.snippet). In short:

```caddy
de.qfunkov.ru {
    # ... existing config ...

    redir /chess /chess/ 308

    handle_path /chess/* {
        reverse_proxy 127.0.0.1:8000 {
            header_up X-Forwarded-Prefix /chess
            header_up X-Forwarded-Proto {scheme}
            header_up X-Forwarded-Host  {host}
            flush_interval -1
        }
    }
}
```

Flask uses `ProxyFix` to read `X-Forwarded-Prefix`, so `url_for()` emits prefixed URLs and SocketIO uses the right path. No code change is needed when toggling between root-mount and sub-path-mount.

## Deploy on Kubernetes

```bash
# Build & push image
docker build -t YOUR_REGISTRY/chess:latest .
docker push YOUR_REGISTRY/chess:latest

# Create secrets
kubectl create secret generic chess-secrets \
  --from-literal=secret-key=$(openssl rand -hex 32) \
  --from-literal=database-url=postgres://user:pw@host:5432/chess

# Apply manifests
kubectl apply -f k8s/deployment.yaml
```

The deployment runs 2 replicas with Redis as the SocketIO message queue, so multiplayer rooms work across replicas. The ingress enables cookie-based session affinity for WebSocket connections.

## Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `SECRET_KEY` | `dev-change-me` | Flask session secret |
| `DATABASE_URL` | `sqlite:///./data/chess.db` | SQLAlchemy URI |
| `REDIS_URL` | _none_ (in-memory) | SocketIO message queue |
| `STOCKFISH_PATH` | `/opt/homebrew/bin/stockfish` | Engine binary |

## Structure

```
app/
  __init__.py          # create_app factory
  config.py            # env-driven config
  extensions.py        # db, login, socketio
  engine.py            # Stockfish wrappers
  models.py            # User, Game
  auth/                # /auth blueprint
  main/                # /, /play
  games/               # /games, /games/<id>
  multiplayer/         # /multiplayer + SocketIO events
  api/                 # /api/{analyze,hint,review}
  templates/
  static/
    css/ js/ js/modules/
wsgi.py
Dockerfile
docker-compose.yml
k8s/deployment.yaml
```
