import importlib.util
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).parents[1] / "scripts/deepseek-release.py"
SPEC = importlib.util.spec_from_file_location("release", SCRIPT)
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)


class ReleaseSafetyTests(unittest.TestCase):
    def test_dry_run_does_not_print_secret_or_require_authentication(self):
        result = subprocess.run([sys.executable, str(SCRIPT), "configure", "-"],
            input='{"TOKENDANCE_API_KEY":"do-not-log-this-value","HY3_RETIRED":"true"}',
            text=True, capture_output=True, check=True)
        self.assertIn('"dryRun": true', result.stdout)
        self.assertNotIn("do-not-log-this-value", result.stdout + result.stderr)

    def test_config_cannot_overwrite_deepseek_or_reenable_hy3(self):
        for values in ({"DEEPSEEK_API_KEY": "x"}, {"HY3_RETIRED": "false"}, {"TOKENDANCE_API_KEY": ""}):
            with self.assertRaises(ValueError):
                release.validate_secrets(values)

    def test_enabled_or_unknown_capabilities_prevent_every_mutation(self):
        for capabilities in ({}, {"textToModel": True, "imageToModel": False, "texture": False}):
            with patch.object(release, "login_from_env", return_value=("token", "public")), \
                 patch.object(release, "request", return_value=capabilities), \
                 patch.object(release, "management") as management:
                with self.assertRaises(RuntimeError):
                    release.retire("admin", "unused")
                management.assert_not_called()

    def test_nonterminal_jobs_or_active_cron_keep_runtime_key(self):
        for pending, active in ((1, False), (0, True)):
            with patch.object(release, "login_from_env", return_value=("token", "public")), \
                 patch.object(release, "request", return_value=dict.fromkeys(
                     ("textToModel", "imageToModel", "texture"), False)), \
                 patch.object(release, "remote_state", return_value={"pending": pending,
                     "cron": [{"jobname": "scene-generation-poll", "active": active}]}), \
                 patch.object(release, "management") as management:
                with self.assertRaises(RuntimeError):
                    release.retire("admin", "unused")
                self.assertTrue(all(call.args[1] != "DELETE" for call in management.call_args_list))

    def test_completed_retirement_deletes_only_hunyuan_key(self):
        with patch.object(release, "login_from_env", return_value=("token", "public")), \
             patch.object(release, "request", return_value=dict.fromkeys(
                 ("textToModel", "imageToModel", "texture"), False)), \
             patch.object(release, "remote_state", return_value={"pending": 0, "cron": [
                 {"jobname": "scene-generation-poll", "active": False},
                 {"jobname": "scene-reconstruction-poll", "active": True}]}), \
             patch.object(release, "management") as management:
            result = release.retire("admin", "unused")
            self.assertTrue(result["hunyuanKeyRemoved"])
            self.assertEqual(management.call_args.args, ("admin", "DELETE", "/secrets", ["HUNYUAN_API_KEY"]))
            self.assertNotIn("scene-reconstruction-poll", release.STOP_SQL)


if __name__ == "__main__":
    unittest.main()
