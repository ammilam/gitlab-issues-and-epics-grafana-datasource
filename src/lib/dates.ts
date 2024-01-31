// Date related functions

// a function that gets the difference in days between two dates
export function getDiffInDays(date1: Date, date2: Date): string {
  const diffInMs = Math.abs(date1.getTime() - date2.getTime());
  let res = Math.ceil(diffInMs / (1000 * 60 * 60 * 24));
  return String(res)
}

// a function that takes in a date and returns a string in the format "YYYY-MM-DD"
export function getDateInfo(date: Date): { monthName: string, monthNumber: number, year: number, dateThreshold: string } {
  const monthNumberInYear = date.getMonth();
  const year = date.getFullYear();
  const monthNumber = monthNumberInYear + 1;
  const monthName = date.toLocaleString('default', { month: 'long' });

  // compare the current month with the month of the date, if the date is in the past return "1:Month Name" else return "0:Month Name"
  let dateThreshold: string;
  // if the month number of the date is less than the current month number, return "1:Month Name"
  if (monthNumberInYear < new Date().getMonth()) {
    dateThreshold = "1:" + monthName
  } else {
    // if the month number of the date is greater than the current month number, return "0:Month Name"
    dateThreshold = "0:" + monthName
  }
  // return an object with the month name, month number and year
  let obj = { monthName, monthNumber, year, dateThreshold }
  return obj
};
