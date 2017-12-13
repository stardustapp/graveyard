package drive

import (
	"log"

	"github.com/boltdb/bolt"
)

func Start(path string) (*Drive, error) {
  log.Println("bolt-drive: Starting", path)
	db, err := bolt.Open(path, 0600, nil)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	log.Println("bolt-drive: Successfully mounted", path)
  return &Drive{
    db: db,
  }, nil
}

type Drive struct {
  db *bolt.DB
}
