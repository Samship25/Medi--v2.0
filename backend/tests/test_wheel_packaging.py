import os
import subprocess
import sys
from pathlib import Path


# Wheel packaging regression: build artifact, isolated install, import smoke for FastAPI app exposure.
BACKEND_DIR = Path(__file__).resolve().parents[1]
DIST_DIR = BACKEND_DIR / "dist"


def _run(cmd: list[str], cwd: Path | None = None, env: dict | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(
        cmd,
        cwd=str(cwd) if cwd else None,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )


def test_01_build_wheel_successfully():
    DIST_DIR.mkdir(parents=True, exist_ok=True)
    result = _run([sys.executable, "-m", "build", "--wheel", "--outdir", str(DIST_DIR)], cwd=BACKEND_DIR)
    assert result.returncode == 0, f"Wheel build failed\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"


def test_02_wheel_artifact_exists_in_dist():
    wheels = sorted(DIST_DIR.glob("meditrack_backend-*.whl"))
    assert wheels, f"No meditrack_backend wheel found in {DIST_DIR}"


def test_03_wheel_installs_into_isolated_target(tmp_path):
    wheels = sorted(DIST_DIR.glob("meditrack_backend-*.whl"))
    assert wheels, "Wheel artifact missing; run build test first"
    wheel = wheels[-1]

    target_dir = tmp_path / "isolated_site_packages"
    target_dir.mkdir(parents=True, exist_ok=True)

    result = _run(
        [sys.executable, "-m", "pip", "install", "--no-deps", "--target", str(target_dir), str(wheel)]
    )
    assert result.returncode == 0, f"Wheel install failed\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"

    assert (target_dir / "meditrack_backend").exists(), "Installed package directory meditrack_backend not found"
    assert any(path.name.startswith("meditrack_backend-") and path.name.endswith(".dist-info") for path in target_dir.iterdir())


def test_04_installed_package_exposes_fastapi_app_with_required_env(tmp_path):
    wheels = sorted(DIST_DIR.glob("meditrack_backend-*.whl"))
    assert wheels, "Wheel artifact missing; run build test first"
    wheel = wheels[-1]

    target_dir = tmp_path / "isolated_site_packages"
    target_dir.mkdir(parents=True, exist_ok=True)
    install_result = _run(
        [sys.executable, "-m", "pip", "install", "--no-deps", "--target", str(target_dir), str(wheel)]
    )
    assert install_result.returncode == 0, (
        f"Wheel install failed for import smoke test\nSTDOUT:\n{install_result.stdout}\nSTDERR:\n{install_result.stderr}"
    )

    env = os.environ.copy()
    env.update(
        {
            "MONGO_URL": "mongodb://localhost:27017",
            "DB_NAME": "test_database",
            "CORS_ORIGINS": "*",
            "JWT_SECRET": "test-secret",
            "EMERGENT_LLM_KEY": "sk-test",
            "PYTHONPATH": str(target_dir),
        }
    )
    smoke = _run(
        [
            sys.executable,
            "-c",
            (
                "from fastapi import FastAPI; "
                "from meditrack_backend import app; "
                "assert isinstance(app, FastAPI); "
                "assert any(route.path == '/api/' for route in app.routes); "
                "print('import_ok')"
            ),
        ],
        env=env,
    )
    assert smoke.returncode == 0, f"Import smoke test failed\nSTDOUT:\n{smoke.stdout}\nSTDERR:\n{smoke.stderr}"
    assert "import_ok" in smoke.stdout