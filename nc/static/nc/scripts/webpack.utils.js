/*
Set global variables for yarn added and webpack packaged modules we need.
*/
Object.entries(main).forEach(
    ([key, value]) => {
      window[key] = value;
    }
);
