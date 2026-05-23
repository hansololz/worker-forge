# Use when creating the worker-forge skill

Additional instruction on how to build the worker-forge skill. This is just supplementary instructions.

# Interview

During the interview process

- After understand what the user is asking. If the worker require local model to complete the task, then suggest
  alternatives that could simplify the task instead so that task can be done with CODE.

- During the interview process, ask the following questions if appropriate
    - OS target [Windows. macOS, Linux]
    - Tool to build the UI [Native GUI, OTHERS, USER_PROVIDE].
        - **OTHERS** Try to find available UI frameworks on local machine and present them as options. This could be
          electron or tauri as example.
        - **USER_PROVIDE** Let the user provide the framework that they want to use. Work with the user to install or
          find them.
    - How user want to store the data. [SQLite, text file, json file, ...]
    - Where data should be store [In the same directory, in home directory]
    - Ask the user to describe the UI
    - What Local Model [OLLAMA, OS MODELS], Only if local models are needed. Different subtask might need different
      models, Let user choose which model to use for which task. Ask this question multiple times if needed, once for
      every subtask.
    - What hosted model to use. [ANTHROPIC, OPEN_AI, GEMINI, USER_PROVIDED]. Different subtask might need different
      models, Let user choose which model to use for which task. Ask this question multiple times if needed, once for
      every subtask.

# Planning

- Always create a plan before starting any work. Make sure the user agrees with the plan.
- Make sure the user knows that the name of the worker is.
- Plan must show step by step subtask. Classify each subtask as CODE, LOCAL, or HOSTED

# Setup

- Have a setup script to deterministically create the workshop directory and necessary files. A workshop directory
  should be `root/workshops/<worker-name>/`.

# Build Worker

- After create all the resources to build the worker, if possible, offer to build the worker for the user. If not, leave
  a message saying that the agent can't build the worker and why.