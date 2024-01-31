// a function that takes in a name and returns a string in the format "First Last"
export function formatName(name: string): string {
  if (name) {
    const nameParts = name.split(".");

    if (nameParts.length === 2) {
      const [firstName, lastName] = nameParts;
      const formattedFirstName = firstName.charAt(0).toUpperCase() + firstName.slice(1);
      const formattedLastNameInitial = lastName.charAt(0).toUpperCase();
      return `${formattedFirstName} ${formattedLastNameInitial}`;
    }
  }

  return name; // Return the original name if it's undefined or doesn't match the expected format
}


// a function that takes in a date and returns a string in the format "YYYY-MM-DD"
export function fDate(date: Date) {
  return new Date(date).toTimeString()
}
