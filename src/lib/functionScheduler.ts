// a function that accepts another function as an argument, and an argument for ms
// and returns a function that will execute the function passed on a set interval

export function functionScheduler(fn: Function, ms: number) {

  // return a function that will execute the function passed on a set interval
  return function () {
    // execute the function passed
    fn();
    // set an interval to execute the function passed every ms
    setInterval(fn, ms);
  }
}

