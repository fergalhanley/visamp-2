/* Load from head.hbs so the language is registered before mdBook highlights code. */
(() => {
  function register() {
    if (!window.hljs) return;
    hljs.registerLanguage("visript", (h) => ({
      name: "Visript",
      keywords: "context prop let fn return render on_init on_frame on_resize if else for in step while true false",
      contains: [
        h.C_LINE_COMMENT_MODE, h.C_BLOCK_COMMENT_MODE, h.QUOTE_STRING_MODE,
        { className: "keyword", begin: /\bon_input_[a-z_]+\b/ },
        { className: "built_in", begin: /\b[a-z][a-z_]*(?:::[a-z][a-z_]*)+/ },
        { className: "variable", begin: /\$[A-Z][A-Z_0-9]*/ },
        h.C_NUMBER_MODE,
      ],
    }));
    document.removeEventListener("load", register, true);
  }
  // Script load events do not bubble, so observe them in the capture phase.
  document.addEventListener("load", register, true);
  register();
})();
