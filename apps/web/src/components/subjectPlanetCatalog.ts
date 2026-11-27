import catalog from '../../../../assets/stellar/subject-planets.json';

export function subjectPlanet(subject: string) {
  const value = subject.trim().toLocaleLowerCase();
  return catalog.subjects.find(item => item.aliases.some(alias => {
    if (/^[a-z ]+$/.test(alias)) return new RegExp(`(^|[^a-z])${alias}([^a-z]|$)`, 'i').test(value);
    return value.includes(alias);
  }));
}

