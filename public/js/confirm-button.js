// A button that asks for a second click before it does something that cannot be undone. The first
// click arms it (the label changes and a question is shown), the second click does the thing, and
// it disarms itself after a few seconds or when focus leaves it.
//
//   idle / armedText   the label before and after the first click
//   question           shown in `status` while armed
//   run()              what to do on the second click
//   check()            optional: return false to stop the first click arming it (it should say why)
export function confirmable(button, { idle, armedText, question, status, run, check }) {
  let timer = null;

  const reset = () => {
    clearTimeout(timer);
    timer = null;
    button.textContent = idle;
    button.classList.remove('is-armed');
  };

  button.addEventListener('blur', () => { if (timer) { reset(); status.textContent = ''; } });
  button.addEventListener('click', async () => {
    if (!timer) {
      if (check && !check()) return;
      button.textContent = armedText;
      button.classList.add('is-armed');
      status.textContent = question;
      timer = setTimeout(() => { reset(); status.textContent = ''; }, 6000);
      return;
    }
    reset();
    button.disabled = true;
    try {
      await run();
    } finally {
      button.disabled = false;
    }
  });
}
