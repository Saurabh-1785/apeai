"""
ApeAI — Slack Integration Route

Uses Slack Bolt SDK in Socket Mode to listen for messages
in subscribed channels. Runs as a background thread alongside FastAPI.

Setup:
  1. Create a Slack app: https://api.slack.com/apps
  2. Enable Socket Mode → generate App-Level Token (xapp-...)
  3. Enable Event Subscriptions → subscribe to bot events:
     - message.channels (public channels)
     - message.groups (private channels)
  4. Add Bot Token Scopes: chat:write, channels:history, groups:history
  5. Install app to workspace → get Bot User OAuth Token (xoxb-...)
  6. Set SLACK_BOT_TOKEN and SLACK_APP_TOKEN in .env
  7. Invite the bot to the channels you want it to monitor
"""

import asyncio
import logging
import threading
from typing import Optional

from backend.app.core.config import settings
from backend.app.services.normalize import normalize_slack
from backend.app.services.save_feedback import save_feedback

logger = logging.getLogger(__name__)

# Module-level reference to the Slack handler thread
_slack_thread: Optional[threading.Thread] = None


def start_slack_listener() -> bool:
    """
    Start the Slack Bolt listener in a background thread.
    
    Returns True if started successfully, False if not configured
    or if an error occurred.
    
    This function is called from main.py during app startup.
    """
    global _slack_thread

    if not settings.slack_configured:
        logger.info(
            "ℹ️  Slack integration not configured — skipping. "
            "Set SLACK_BOT_TOKEN and SLACK_APP_TOKEN in .env to enable."
        )
        return False

    if _slack_thread and _slack_thread.is_alive():
        logger.info("Slack listener is already running")
        return True

    try:
        # Import Slack SDK only when actually needed
        from slack_bolt import App
        from slack_bolt.adapter.socket_mode import SocketModeHandler

        # Initialize the Slack Bolt app
        slack_app = App(token=settings.slack_bot_token)

        @slack_app.event("message")
        def handle_message(body, logger):
            """
            Handle incoming Slack messages.
            
            This fires for every message in channels where the bot
            is a member. We filter out bot messages to prevent loops.
            """
            event = body.get("event", {})

            # Ignore bot messages (prevents infinite loops)
            if event.get("bot_id") or event.get("subtype") == "bot_message":
                return

            # Ignore message edits and deletions
            if event.get("subtype") in ("message_changed", "message_deleted"):
                return

            try:
                # Normalize the Slack message to our unified format
                feedback_item = normalize_slack(event)

                # Save to database (run async function from sync context)
                loop = asyncio.new_event_loop()
                try:
                    result = loop.run_until_complete(save_feedback(feedback_item))
                    logger.info(
                        f"✅ Slack feedback saved: id={result.get('id')}, "
                        f"channel={event.get('channel')}"
                    )
                finally:
                    loop.close()

            except ValueError as e:
                logger.warning(f"Skipping Slack message: {e}")
            except Exception as e:
                logger.error(f"❌ Failed to process Slack message: {e}")

        @slack_app.event("app_mention")
        def handle_app_mention(body, logger):
            """Handle @mentions of the bot — treat as feedback too."""
            event = body.get("event", {})
            try:
                feedback_item = normalize_slack(event)
                loop = asyncio.new_event_loop()
                try:
                    loop.run_until_complete(save_feedback(feedback_item))
                finally:
                    loop.close()
            except Exception as e:
                logger.error(f"❌ Failed to process Slack mention: {e}")

        # Start Socket Mode handler in a background thread
        handler = SocketModeHandler(slack_app, settings.slack_app_token)

        def run_slack():
            try:
                logger.info("🚀 Slack Bolt listener starting (Socket Mode)...")
                handler.start()
            except Exception as e:
                logger.error(f"❌ Slack listener crashed: {e}")

        _slack_thread = threading.Thread(
            target=run_slack,
            daemon=True,  # Thread dies when main process exits
            name="slack-bolt-listener",
        )
        _slack_thread.start()
        logger.info("✅ Slack Bolt listener started in background thread")
        return True

    except ImportError:
        logger.error(
            "❌ slack-bolt package not installed. "
            "Run: pip install slack-bolt"
        )
        return False
    except Exception as e:
        logger.error(f"❌ Failed to start Slack listener: {e}")
        return False


def stop_slack_listener():
    """Stop the Slack listener thread (if running)."""
    global _slack_thread
    if _slack_thread and _slack_thread.is_alive():
        logger.info("Stopping Slack listener...")
        # Daemon thread will be killed when main process exits
        _slack_thread = None
