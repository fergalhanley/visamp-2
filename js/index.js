import("../pkg/visamp_2.js").then(module => {
   module.main_web();

   const editor = document.getElementById("editor");
   const errorBar = document.getElementById("error-bar");

   let debounceTimer = null;
   let lastError = "";

   function showError(msg) {
     if (msg && msg !== lastError) {
       errorBar.textContent = msg;
       errorBar.style.display = "block";
       lastError = msg;
     }
   }

   function clearError() {
     if (lastError) {
       errorBar.style.display = "none";
       errorBar.textContent = "";
       lastError = "";
     }
   }

   editor.addEventListener("input", () => {
     clearTimeout(debounceTimer);
     debounceTimer = setTimeout(() => {
       const code = editor.value;
       const error = module.load_script(code);
       if (error) {
         showError(error);
       } else {
         clearError();
       }
     }, 300);
   });

   // Poll for runtime errors from the animation loop
   setInterval(() => {
     const error = module.get_last_error();
     if (error) {
       showError(error);
     } else {
       clearError();
     }
   }, 500);
});
