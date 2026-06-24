import { execFileSync } from "child_process";

export class GitAgent {
  private token: string;
  private owner: string;
  private repo: string;

  constructor() {
    this.token = process.env.GITHUB_TOKEN || "";
    this.owner = process.env.GITHUB_REPO_OWNER || "";
    this.repo = process.env.GITHUB_REPO_NAME || "";

    if (!this.token) {
      console.warn(
        "[GitAgent] WARNING: GITHUB_TOKEN is not set in environment variables. Remote git operations may fail.",
      );
    }
  }

  private configureGit() {
    if (!this.token || !this.owner || !this.repo) {
      console.warn(
        "[GitAgent] Missing GITHUB_TOKEN, GITHUB_REPO_OWNER, or GITHUB_REPO_NAME. Push might fail.",
      );
      return false;
    }
    try {
      execFileSync("git", ["config", "--global", "user.name", "AI Agent"]);
      execFileSync("git", ["config", "--global", "user.email", "bot@xauusd.ai"]);

      const remoteUrl = `https://${this.token}@github.com/${this.owner}/${this.repo}.git`;
      try {
        execFileSync("git", ["remote", "set-url", "origin", remoteUrl]);
      } catch {
        execFileSync("git", ["remote", "add", "origin", remoteUrl]);
      }
      return true;
    } catch (err: any) {
      console.error("[GitAgent] Failed to configure Git:", err.message);
      return false;
    }
  }

  commitAll(message: string) {
    if (!this.token) throw new Error("GITHUB_TOKEN not found");
    // Validate input message roughly
    const cleanMessage = String(message).replace(/[\r\n]/g, " ").trim() || "Automated commit";
    
    try {
      this.configureGit();

      execFileSync("git", ["add", "."], { stdio: "pipe" });
      const status = execFileSync("git", ["status", "--porcelain"]).toString();
      if (!status) {
        return {
          success: true,
          message: "No changes to commit",
          commit_sha: this.getLastCommit(),
        };
      }
      execFileSync("git", ["commit", "-m", cleanMessage], { stdio: "pipe" });
      execFileSync("git", ["push", "origin", "main"], { stdio: "pipe" });
      const sha = this.getLastCommit();
      return {
        success: true,
        commit_sha: sha,
        github_url: `https://github.com/${this.owner}/${this.repo}/commit/${sha}`,
      };
    } catch (err: any) {
      throw new Error(`Git commit failed: ${err.message}`);
    }
  }

  rollbackTo(sha: string) {
    if (!this.token) throw new Error("GITHUB_TOKEN not found");
    if (!/^[0-9a-fA-F]{4,40}$/.test(sha) && sha !== "HEAD~1") {
       throw new Error("Invalid SHA format for rollback.");
    }
    try {
      this.configureGit();

      execFileSync("git", ["reset", "--hard", sha], { stdio: "pipe" });
      execFileSync("git", ["push", "--force", "origin", "main"], { stdio: "pipe" });
      return { success: true, status: "rolled back", commit: sha };
    } catch (err: any) {
      throw new Error(`Git rollback failed: ${err.message}`);
    }
  }

  getLastCommit(): string {
    try {
      return execFileSync("git", ["rev-parse", "HEAD"]).toString().trim();
    } catch (err) {
      return "unknown_sha";
    }
  }
}

export const gitAgent = new GitAgent();
