# grepo

<p align="center">
  <b>An agentic CLI tool for analyzing, describing, and generating documentation for GitHub repositories.</b>
</p>

<p align="center">
  <a href="https://github.com/ElysiumOSS/grepo/blob/main/LICENSE.md" target="_blank"><img alt="📝 License: MIT" src="https://img.shields.io/badge/%F0%9F%93%9D_license-MIT-21bb42.svg" /></a>
  <a href="https://npmjs.com/package/@elysiumoss/grepo" target="_blank"><img alt="📦 npm version" src="https://img.shields.io/npm/v/@elysiumoss/grepo?color=21bb42&label=%F0%9F%93%A6%20npm" /></a>
</p>

## Overview

`grepo` automates the heavy lifting of repository maintenance. By integrating with LLM providers like Google Gemini, it intelligently analyzes your codebase to generate professional READMEs, suggest relevant repository topics, craft repository descriptions, summarize technologies, and recommend improvements.

### High-Level Flow

```mermaid
flowchart LR
    User(["👤 User"]) -->|grepo readme owner/repo| CLI["🛠️ grepo CLI"]
    CLI --> Config["⚙️ Config Builder<br/>env + .grepo + flags"]
    Config --> Ingest["📦 GitIngest<br/>tree + content"]
    Ingest --> LLM["🤖 Gemini LLM"]
    LLM --> Validator["🧪 Mermaid Validator"]
    Validator --> Output{"Output target?"}
    Output -->|--push / --apply| GitHub["🐙 GitHub API"]
    Output -->|local| File["📄 README.md / stdout"]
    GitHub -.->|writes| Repo[("Repository")]
```

## Architecture

`grepo` is built on top of the [Effect](https://effect.website/) ecosystem, providing typed errors, composable services, and structured concurrency. The CLI is decomposed into **commands**, **services**, and **utilities**.

### Module Layout

```mermaid
graph TB
    subgraph Entry["Entry Point"]
        cli["cli.ts<br/>argv router"]
    end

    subgraph Commands["Commands (src/commands)"]
        readme["readme.ts"]
        topics["topics.ts"]
        describe["describe.ts"]
        analyze["analyze.ts<br/>summary/tech/improve"]
    end

    subgraph Services["Services (src/services.ts)"]
        gemini["Gemini Service"]
        github["GitHub Service"]
        gitingest["GitIngest fetcher"]
    end

    subgraph Utils["Utilities (src/utils)"]
        args["args.ts<br/>parser"]
        validation["validation.ts<br/>URL/key checks"]
        configFile["config-file.ts<br/>~/.grepo"]
        prompts["prompts/readme.ts"]
        mermaid["mermaid.ts<br/>diagram fixer"]
        logger["logger.ts"]
    end

    cli --> args
    cli --> configFile
    cli --> Commands
    Commands --> Services
    Commands --> validation
    readme --> prompts
    readme --> mermaid
    Services --> logger
```

### Layered Architecture

```mermaid
flowchart TB
    subgraph Presentation["Presentation Layer"]
        argv["argv parsing"]
        usage["usage / help text"]
        loggerOut["structured logger"]
    end

    subgraph Application["Application Layer (Commands)"]
        runReadme["readme.run"]
        runTopics["topics.run"]
        runDescribe["describe.run"]
        runAnalyze["analyze.run"]
    end

    subgraph Domain["Domain Layer (Services)"]
        Gemini["Gemini (Effect Tag)"]
        GitHub["GitHub (Effect Tag)"]
        fetchRepo["fetchRepo"]
    end

    subgraph Infra["Infrastructure"]
        GeminiClient["@google/genai"]
        GitHubClient["fetch + REST v3"]
        GitIngestAPI["gitingest.com"]
    end

    Presentation --> Application
    Application --> Domain
    Domain --> Infra
```

## Command Pipeline

Every command follows the same shape: **parse → fetch context → prompt → act**. The `readme` command adds analysis, generation, and mermaid validation phases.

### Generic Command Flow

```mermaid
flowchart TD
    Start(["grepo <cmd> <url>"]) --> ParseArgs["Parse argv<br/>(args.ts)"]
    ParseArgs --> LoadEnv["Load .env / ~/.grepo"]
    LoadEnv --> HasKey{"GEMINI_API_KEY<br/>present?"}
    HasKey -->|no| Prompt["Interactive setup<br/>(promptConfigSetup)"]
    HasKey -->|yes| Build["buildConfig()"]
    Prompt --> Build
    Build --> Validate{"Valid URL +<br/>key + token?"}
    Validate -->|no| Fail(["❌ ValidationError"])
    Validate -->|yes| Branch["Detect default branch"]
    Branch --> Layers["Compose Effect layers<br/>(GeminiLive, GitHubLive)"]
    Layers --> Dispatch["Dispatch by command"]
    Dispatch --> Run["run(config)"]
    Run --> Done(["✅ Result / push"])
```

### `readme` — Three-Phase Generation

```mermaid
flowchart LR
    A["Repo URL"] --> B["GitIngest fetch"]
    B --> C["extractExistingReadme"]
    C --> D["Phase 1<br/>Analysis prompt"]
    D --> E["parseAnalysis"]
    E --> F["Phase 2<br/>Generation prompt"]
    F --> G["Raw markdown"]
    G --> H["Phase 3<br/>validateAndFixMermaid"]
    H --> I{"Push?"}
    I -->|yes| J["github.pushFile"]
    I -->|no| K["writeFile(README.md)"]
```

### `topics` — Suggest & Apply

```mermaid
flowchart LR
    A["Repo URL"] --> B["GitIngest fetch"]
    B --> C["Topics prompt"]
    C --> D["Gemini → JSON array"]
    D --> E["validate topics"]
    E --> F{"--apply?"}
    F -->|yes + --merge| G["getTopics ∪ new"]
    F -->|yes| H["setTopics(new)"]
    F -->|no / --dry-run| I["Print only"]
    G --> H
    H --> J(["✅ Topics updated"])
```

### `describe` — Description + Homepage Detection

```mermaid
flowchart LR
    A["Repo URL"] --> B["GitIngest fetch"]
    B --> C["Describe prompt<br/>(detect homepage<br/>from package.json,<br/>CNAME, badges...)"]
    C --> D["Gemini → {description, homepage}"]
    D --> E{"--apply?"}
    E -->|yes| F["github.updateRepo"]
    E -->|no| G["Print only"]
    F --> H(["✅ About section updated"])
```

## Service Topology

Services are exposed as `Effect` Context Tags so commands can declare dependencies in their type signature without coupling to concrete clients.

```mermaid
classDiagram
    class GeminiServiceApi {
        +generateContent(prompt) Effect~string, GeminiError~
    }
    class GitHubServiceApi {
        +getDefaultBranch(owner, repo)
        +getTopics(owner, repo)
        +setTopics(owner, repo, topics)
        +pushFile(owner, repo, path, content, msg, branch)
        +updateRepo(owner, repo, data)
    }
    class GitIngest {
        +fetchRepo(url, token) Effect~RepoData, GitIngestError~
    }
    class GeminiClient {
        -apiKey
        +generateContent(prompt)
    }
    class GitHubClient {
        -token
        +getDefaultBranch()
        +pushFile()
        +setTopics()
        +updateRepo()
    }

    GeminiServiceApi <|.. GeminiClient : provides
    GitHubServiceApi <|.. GitHubClient : provides
    GeminiServiceApi --> GeminiError : may fail with
    GitHubServiceApi --> GitHubError : may fail with
    GitIngest --> GitIngestError : may fail with
```

## Sequence: Generating a README

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant C as grepo CLI
    participant Cfg as Config
    participant GI as GitIngest
    participant G as Gemini
    participant M as Mermaid Validator
    participant GH as GitHub API
    participant FS as Local FS

    U->>C: grepo readme https://github.com/o/r --push
    C->>Cfg: loadEnv + buildConfig
    Cfg-->>C: GrepoConfig
    C->>GH: getDefaultBranch(o, r)
    GH-->>C: "main"
    C->>GI: fetchRepositoryContent(url)
    GI-->>C: { tree, content }
    C->>G: analysisPrompt(tree, content)
    G-->>C: structured analysis
    C->>G: generationPrompt(analysis)
    G-->>C: raw README markdown
    C->>M: validateAndFixMermaid(raw)
    alt Diagram has syntax errors
        M->>G: re-prompt with error
        G-->>M: corrected diagram
    end
    M-->>C: validated README
    C->>FS: writeFile("README.md")
    C->>GH: pushFile(o, r, "README.md", branch)
    GH-->>U: ✅ commit
```

## Configuration Resolution

`grepo` resolves credentials in a layered, override-friendly order:

```mermaid
flowchart TD
    Start(["Need GEMINI_API_KEY"]) --> Env{"process.env<br/>GEMINI_API_KEY?"}
    Env -->|yes| Use(["✅ use it"])
    Env -->|no| Google{"GOOGLE_API_KEY?"}
    Google -->|yes| Use
    Google -->|no| File{"~/.grepo/config<br/>geminiApiKey?"}
    File -->|yes| Use
    File -->|no| Prompt["Interactive setup<br/>(promptConfigSetup)"]
    Prompt --> Save["Save 0600 file<br/>writeConfigFile"]
    Save --> Use
```

## Error Model

Errors are tagged data classes from `errors.ts`. Each command declares its possible failures in the type so `Effect.catchTags` can route them to user-friendly messages.

```mermaid
stateDiagram-v2
    [*] --> Running
    Running --> GeminiError: LLM call failed
    Running --> GitHubError: API call failed
    Running --> GitIngestError: ingest failed
    Running --> ValidationError: bad URL / key
    Running --> Success: ✅ exit 0

    GeminiError --> ExitNonZero: log + exit 1
    GitHubError --> ExitNonZero
    GitIngestError --> ExitNonZero
    ValidationError --> ExitNonZero
    ExitNonZero --> [*]
    Success --> [*]
```

## Installation

Ensure you have [Bun](https://bun.sh/) (or Node ≥ 20.19) installed, then install `grepo` globally:

```bash
bun add -g @elysiumoss/grepo
# or
npm install -g @elysiumoss/grepo
```

## Usage

Generate a new `README.md` for a repository:

```bash
grepo readme https://github.com/owner/repo --format md --push
```

Automatically update repository topics based on code analysis:

```bash
grepo topics https://github.com/owner/repo --apply --merge
```

Generate a description and detect the homepage:

```bash
grepo describe https://github.com/owner/repo --apply
```

## CLI Reference

| Command    | Description                                                |
| :--------- | :--------------------------------------------------------- |
| `readme`   | Generate and optionally push a README documentation file   |
| `topics`   | Analyze code and suggest/apply repository topics           |
| `describe` | Generate a repository description and detect homepage URLs |
| `summary`  | Provide a comprehensive summary of the repository          |
| `tech`     | List technologies, frameworks, and tools used              |
| `improve`  | Suggest 5 specific, actionable improvements                |

### Options

| Flag                  | Applies to              | Description                                                |
| :-------------------- | :---------------------- | :--------------------------------------------------------- |
| `--format md\|mdx`    | `readme`                | Output format (default: `md`)                              |
| `--style …`           | `readme`                | `minimal`, `standard`, or `comprehensive` (default: standard) |
| `--output <file>`     | `readme`                | Output file path                                           |
| `--push`              | `readme`                | Commit the generated file directly to GitHub               |
| `--apply`             | `topics`, `describe`    | Apply changes to the GitHub API                            |
| `--merge`             | `topics`                | Merge with existing topics instead of replacing            |
| `--dry-run`           | all mutating commands   | Preview changes without writing or pushing                 |
| `--branch <name>`     | `readme`                | Target branch (default: auto-detect from repo)             |
| `--tone <voice>`      | `readme`                | `casual`, `professional`, `minimal`, or `technical`        |

## Configuration

`grepo` requires authentication for repository access and AI analysis. Configure these via environment variables, a `.env` file, or `~/.grepo/config.json`:

| Key                                 | Required for                       |
| :---------------------------------- | :--------------------------------- |
| `GEMINI_API_KEY` / `GOOGLE_API_KEY` | All commands (LLM analysis)        |
| `GH_TOKEN` / `GITHUB_TOKEN`         | `--push`, `--apply`, `--merge`     |

**Example `.env` file:**

```env
GEMINI_API_KEY=AIzaSy...
GH_TOKEN=ghp_...
```

If no key is present, `grepo` will run an interactive setup on first use and persist your choices to `~/.grepo/config.json` with `0600` permissions.

## Development

```bash
git clone https://github.com/ElysiumOSS/grepo
cd grepo
bun install
bun run build       # tsdown build
bun run test        # vitest
bun run lint        # biome check
```

### Testing Topology

```mermaid
graph LR
    Vitest["vitest"] --> Unit["Unit tests<br/>*.test.ts"]
    Unit --> ConfigT["config.test.ts"]
    Unit --> CommandT["commands/*.test.ts"]
    Unit --> UtilT["utils/*.test.ts"]
    Unit --> MermaidT["mermaid.test.ts"]
    Vitest --> Coverage["@vitest/coverage-v8<br/>≥ 80% target"]
```

See [`.github/CONTRIBUTING.md`](./.github/CONTRIBUTING.md) and [`.github/DEVELOPMENT.md`](./.github/DEVELOPMENT.md) for detailed guidelines.

## License

This project is licensed under the [MIT License](LICENSE.md).
