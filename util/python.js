import { spawnSync } from 'child_process';

// The interpreter that runs chatbot/chatbot.py. Windows installs it as "python", most other
// systems as "python3". Set PYTHON in .env to use another one, such as a full path.
export const pythonCommand = () =>
  process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');

export const pythonAvailable = () => spawnSync(pythonCommand(), ['--version']).status === 0;
