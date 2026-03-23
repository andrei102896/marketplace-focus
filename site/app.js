(() => {
  const details = document.querySelectorAll("details");
  details.forEach((detail) => {
    detail.addEventListener("toggle", () => {
      if (!detail.open) {
        return;
      }

      details.forEach((other) => {
        if (other !== detail) {
          other.open = false;
        }
      });
    });
  });
})();
