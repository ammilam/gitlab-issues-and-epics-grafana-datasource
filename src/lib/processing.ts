export function getUniqueFieldValues(field: string, allData: any[]): string[] {
  const uniqueFieldValuesSet = allData.reduce((uniqueValues, item) => {
    let fieldValue;

    if (!item[field]) {
      return uniqueValues;
    } else {
      fieldValue = item[field];
    }

    if (fieldValue) {
      uniqueValues.add(fieldValue);
    }
    return uniqueValues;
  }, new Set<string>());

  return Array.from(uniqueFieldValuesSet);
}

export function findMostCommonElement(arr: any[]): any | undefined {
  const frequencyMap: Map<any, number> = new Map();

  // Count the occurrences of each element
  for (const item of arr) {
    if (frequencyMap.has(item)) {
      frequencyMap.set(item, frequencyMap.get(item)! + 1);
    } else {
      frequencyMap.set(item, 1);
    }
  }

  let mostCommonElement: any | undefined;
  let highestFrequency = 0;

  // Find the element with the highest frequency
  frequencyMap.forEach((frequency, item) => {
    if (frequency > highestFrequency) {
      mostCommonElement = item;
      highestFrequency = frequency;
    }
  });

  return mostCommonElement;
}
