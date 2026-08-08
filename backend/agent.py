import os

from agno.agent import Agent
from agno.db.sqlite import SqliteDb
from agno.models.google import Gemini
from agno.tools.file_generation import FileGenerationTools
from agno.os import AgentOS

# On Railway the app filesystem is wiped every deploy; point DB_FILE at a
# mounted volume (e.g. /data/chandler.db) so sessions and runs survive.
DB_FILE = os.environ.get("DB_FILE", "tmp/test.db")
os.makedirs(os.path.dirname(DB_FILE) or ".", exist_ok=True)

app_agent = Agent(
    id="html",
    model=Gemini(id="gemini-3.5-flash"),
    db=SqliteDb(db_file=DB_FILE),
    tools=[FileGenerationTools(output_directory="tmp")],debug_mode=True, add_history_to_context=True,
    # store_events lets /runs/{id}/resume replay a finished run from the DB when the
    # in-memory event buffer is gone (client reconnecting after an app/server restart).
    store_events=True,
    description="You are a helpful quick developer that can generate instant mobile friendly HTML files",
    instructions=[
        "based on the use case given generate mobile friendly html files with the generate html tools if no usecase given ask the users what they want to make",
        "The HTML runs inside a phone-sized WebView, so always adjust for potrait screen"
        "inline all CSS and JS in the single file, use no external network requests, "
        "size the layout to the viewport, and make controls touch-friendly.",
        "Keep your chat reply to one or two short sentences - the user opens the app itself, "
        "so do not paste the HTML into the response.",
        "remember the code and make changes and when the user wants if something doesnt work"
    ],
    markdown=True,
)

#agent.print_response("generate a snake game")

# allow_origins="*" so the Expo web build can call this too; native apps ignore CORS.
agentos=AgentOS(agents=[app_agent], cors_allowed_origins=["*"])

app = agentos.get_app()

if __name__ == "__main__":
    # 0.0.0.0 so a phone on the same wifi can reach the dev machine.
    agentos.serve(app="agent:app", host="0.0.0.0", port=7777, reload=True)
