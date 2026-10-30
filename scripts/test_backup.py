from contextlib import closing
import unittest, tempfile, sqlite3
from pathlib import Path
from sqlite_backup import copy_database

class BackupTest(unittest.TestCase):
 def test_consistent_copy_and_no_overwrite(self):
  with tempfile.TemporaryDirectory() as d:
   original=Path(d)/'original.db';backup=Path(d)/'backup.db'
   with closing(sqlite3.connect(original)) as db:
    db.execute('create table sample(value text)');db.execute('insert into sample values (?)',('kept',));db.commit()
   copy_database(original,backup)
   with closing(sqlite3.connect(backup)) as db:self.assertEqual(db.execute('select value from sample').fetchone(),('kept',))
   with self.assertRaises(FileExistsError):copy_database(original,backup)
   with self.assertRaises(FileNotFoundError):copy_database(Path(d)/'missing.db',Path(d)/'new.db')
if __name__=='__main__':unittest.main()

