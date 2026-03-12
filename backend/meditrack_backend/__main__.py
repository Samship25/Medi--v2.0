import uvicorn

from server import app


def run():
    uvicorn.run(app, host="0.0.0.0", port=8001)


if __name__ == "__main__":
    run()