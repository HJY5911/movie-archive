"""Import this application from the hosting service's WSGI configuration."""

from server import create_app

application = create_app()
