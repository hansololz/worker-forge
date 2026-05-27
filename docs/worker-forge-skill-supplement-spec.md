# Use when creating the worker-forge skill

Additional instruction on how to build the worker-forge skill. This is just supplementary instructions.

# Interview

During the interview process

- After understand what the user is asking. If the worker require local model to complete the task, then suggest
  alternatives that could simplify the task instead so that task can be done with CODE.
- For authoring, if the answer is common to all, keep it in `AUTHROR.md`, if the answer is only specific to an OS, keep
  it in the OS-specific.md
- When user asks to rebuild the app on a new OS, read from `AUTHROR.md`, `WORKER.md` and do the interview process again.
- During the interview process, ask the following questions if appropriate. Options are should mutually inclusive when
  possible. Always try to give suggestions to make it easier for the users to use this skill.
    - Ask user what they want the worker name to be also what should the display name. Give suggestions.
    - How user want to trigger the worker [DOUBLE_CLICK_ONLY_NO_GUI, CLI, GUI, USER_PROVIDE]. DOUBLE_CLICK_ONLY_NO_GUI
      and GUI are mutually exclusive.
    - Do you want the user to schedule the worker. Ask how user want the schedule to be done. Periodic trigger only when
      worker is running, start worker on startup. User may want multiple option.
    - Ask the user if want to provide a icon or use the default icon for the worker application, first option should
      using the default icon.
    - Tool to build the UI [Native GUI, OTHERS, USER_PROVIDE].
        - **OTHERS** Try to find available UI frameworks on local machine and present them as options. This could be
          electron or tauri as example.
        - **USER_PROVIDE** Let the user provide the framework that they want to use. Work with the user to install or
          find them.
    - If using GUI, ask user what color theme do they prefer. Always try to default to dark theme
      first. [DARK (recommneded), Light, USER_PROVIDER]
    - How user want to store the data. [Local Database (SQLite), text file, json file, USER_PROVIDE]
    - Where data should be store [In the same directory, in home directory, mounted drive, USER_PROVIDE]
    - Ask the user to describe the UI
    - What Local Model [OLLAMA, OS MODELS, USER_PROVIDE], Only if local models are needed. Different subtask might need
      different
      models, Let user choose which model to use for which task. Ask this question multiple times if needed, once for
      every subtask.
    - What hosted model to use. [ANTHROPIC, OPEN_AI, GEMINI, USER_PROVIDED]. Different subtask might need different
      models, Let user choose which model to use for which task. Ask this question multiple times if needed, once for
      every subtask.
    - If Local model is needed, ask user if they want a setup script to be packaged within the worker. The agent would
      create the script for the user add it to worker distribution.
    - If a hosted mode is needed, ask user about who they want the worker to connect to the hosted service and make
      suggestions.

# Planning

- Always create a plan before starting any work. Make sure the user agrees with the plan.
- Make sure the user knows that the name of the worker is.
- Plan must show step by step subtask. Classify each subtask as CODE, LOCAL, or HOSTED

- Make sure the start of the Plan section is clearly visible. Something like the following

```
----------------------------------------
START OF PLAN
----------------------------------------
```

- Make sure the request to confirm is clearly visible and easy to notice

# Setup

- Have a setup script to deterministically create the workspace directory and necessary files. A workspace directory
  should be `root/workspaces/<worker-name>/`.
- Create script to set up build directory, new directory should be
  ```
  root\workspaces\
      <worker-name>\
          windows\
              windows-specific.md
          mac\
              mac-specific.md
          linux\
              linux-specific.md
          AUTHROR.md
          WORKER.md
  ```
  Each folder should contain all the files to build the app for the OS. Each folder may contain different languages
  depending on what the user specify. There is no need to read about the code for other OS. Just focus on the
  current OS as the primary context.

# Build Worker

- After create all the resources to build the worker, if possible, offer to build the worker for the user. If not, leave
  a message saying that the agent can't build the worker and why.
- After creating each script, examine the script for security issues. Things to always do includes making sure all
  inputs are sanitized. Make sure inputs are restricted to only what is needed.
- Always try to use a binary for distribution. Try your best to make sure there is no dependency on the user's machine.
  Unless the user specifically ask for it. External dependencies that are generally allowed are interface for local
  models and hosted external models.
- Worker should always try to fetch the least amount of data from online as possible unless user asks.
- After all the scripts are resources are created, do a security scan one more time for bugs and potential security
  issues.
- Always use the display name for the built app distribution. Like `Manga Katana Watcher.exe` and not
  `manga-katana-watcher.exe`.
  ~~- During building of the worker app, I want the GUI to look modern and slick. Something the claude doc Mac desktop
  app
  as inspiration, I want the worker app to look like that.
  Try to use light theme. If the user has NPM installed, try to use electron and tailwind-css to build the app.
  If NPM is not found, ask if the user want to install it or user another GUI framework.
  Suggest a few frameworks to use.~~
- During building of the worker app, I want the GUI to look modern and slick. Something like the Claude Code app on
  macOS.
- Update the default-theme to be light theme. Get inspiration from tailwind CSS I like the color theme, layout, and
  corner radius and sizes. I also like the color theme from Claude Code on Mac Desktop app, also use that as
  inspiration.
- Suggest to user which framework to use. Also indicate how much would the worker app size be. First option should be
  the option to use the native app. Like for Mac is would be native swift app. If NPM is available, offer to use
  Election. If Rust is available, offer to use Tarui.
- The top bar of the work app sometime is white while the color them is dark. Make sure that the top bar is the same
  color as the app body.
- After the worker is created, create a short README.md in the workspace for the worker. It just needs a
    - name
    - one-two sentence description
    - a list of feature in bullet points ordered by most important bullet point
- Always try to build the app for the user. Try to test it if you can and fix any issues.
- If you can't build run the build script for the user, clearly state why you can't run it and print the command the
  user could use to run the build command.

# Amendments

- During building of the worker app, I want the GUI to look modern and slick. Something like the Claude Code app on
  macOS.
- Update the default-theme to be light theme. Get inspiration from tailwind CSS I like the color theme, layout, and
  corner radius and sizes. I also like the color theme from Claude Code on Mac Desktop app, also use that as
  inspiration.
- Suggest to user which framework to use. Also indicate how much would the worker app size be. First option should be
  the option to use the native app. Like for Mac is would be native swift app. If NPM is available, offer to use
  Election. If Rust is available, offer to use Tarui.