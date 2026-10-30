from contextlib import closing
"""Consistent SQLite backup or restore to a new destination; never overwrite."""
import argparse, sqlite3
from pathlib import Path

def copy_database(source, destination):
 source=Path(source).resolve(); destination=Path(destination).resolve()
 if not source.is_file():raise FileNotFoundError(source)
 if destination.exists():raise FileExistsError(destination)
 with closing(sqlite3.connect(source.as_uri()+'?mode=ro',uri=True)) as original:
  if original.execute('PRAGMA integrity_check').fetchone()!=('ok',):raise ValueError('Source integrity check failed')
  # Exclusive create prevents accidentally replacing a database, even during a race.
  with destination.open('xb'):pass
  with closing(sqlite3.connect(destination)) as copied:
   original.backup(copied)
   if copied.execute('PRAGMA integrity_check').fetchone()!=('ok',):raise ValueError('Backup integrity check failed')

if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('source');parser.add_argument('destination');args=parser.parse_args()
 copy_database(args.source,args.destination);print('SQLite copy verified; original unchanged.')

