package computer

import (
  "fmt"
	"log"
  "time"
  "sync"

	"github.com/boltdb/bolt"

  "github.com/stardustapp/core/computer/schema"
)

// Opens (possibly creating) a boltdrive containing typed data buckets.
// Each drive has its own type registry and bucket dictionary.
// Buckets are created using a single root type from the registry.
// All data stored to that bucket is validated against that type.
// Buckets are named arbitrarily and share a drive-wide namespace.
func openBoltDrive(path string) (*BoltDrive, error) {
  log.Println("bolt-drive: Starting", path)
	db, err := bolt.Open(path, 0600, &bolt.Options{Timeout: 1 * time.Second})
	if err != nil {
		return nil, err
	}

  // make some buckets
  err = db.Update(func(tx *bolt.Tx) error {
    _, err := tx.CreateBucketIfNotExists([]byte("shapes"))
  	if err != nil {
  		return fmt.Errorf("create types bucket: %s", err)
  	}
    _, err = tx.CreateBucketIfNotExists([]byte("buckets"))
  	if err != nil {
  		return fmt.Errorf("create buckets bucket: %s", err)
  	}
  	return nil
  })
  if err != nil {
		return nil, err
	}

	log.Println("bolt-drive: Successfully mounted", path)
  return &BoltDrive{
    db: db,
    shapes: make(map[uint64]*boltShape),
  }, nil
}

type BoltDrive struct {
  db *bolt.DB
  shapes map[uint64]*boltShape
  shapeMutex sync.Mutex
}

func (bd *BoltDrive) InstallSpec(name string, spec *schema.SchemaSpec) (map[string]uint64, error) {
  bd.shapeMutex.Lock()
  defer bd.shapeMutex.Unlock()
  log.Println("bolt-drive: installing spec", spec.Origin)

  typeIdxs := make(map[string]uint64)
  //hashIdxs := make(map[string]uint64)

  err := bd.db.Update(func(tx *bolt.Tx) error {
    for _, typeSpec := range spec.Types {
      log.Printf("hi %+v", typeSpec)
    }

    //b := tx.Bucket([]byte("shapes"))
    //err := b.Put([]byte(key), data)
  	return nil // err
  })

  return typeIdxs, err
}

// probably similar to gob's wire, maybe
type boltShape struct {

}

/*
func (bd *BoltDrive) ReadKey(bucket string, key string) ([]byte, error) {
  var data []byte
  err := bd.db.View(func(tx *bolt.Tx) error {
    b := tx.Bucket([]byte(bucket))
    data = b.Get([]byte(key))
  	return nil
  })
  return data, err
}

func (bd *BoltDrive) WriteKey(bucket string, key string, data []byte) error {
  return bd.db.Update(func(tx *bolt.Tx) error {
    b := tx.Bucket([]byte(bucket))
    err := b.Put([]byte(key), data)
  	return err
  })
}
*/

func (bd *BoltDrive) Close() error {
  return bd.db.Close()
}
