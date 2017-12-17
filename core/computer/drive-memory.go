package computer

import (
	"log"
	"sync"

  "github.com/stardustapp/core/computer/schema"
  "github.com/stardustapp/core/base"
)

// Memory drives are a volatile StarDrive implementation
// They never persist anything outside of the process, like RAM disks
// This means there's no concerns about serialization or disk migrations

func newMemoryDrive() *MemoryDrive {
	return &MemoryDrive{
		//specs: make(map[string]*schema.SchemaSpec),
		shapes: make(map[int]*memoryShape),
	}
}

type MemoryDrive struct {
	//specs map[string]*schema.SchemaSpec
	shapes     map[int]*memoryShape
	shapeMutex sync.Mutex
}

var _ Drive = (*MemoryDrive)(nil)

func (bd *MemoryDrive) InstallSpec(name string, spec *schema.SchemaSpec) (map[string]Shape, error) {
	bd.shapeMutex.Lock()
	defer bd.shapeMutex.Unlock()
	log.Println("bolt-drive: installing spec", name, "from", spec.Origin)

	typeIdxs := make(map[string]Shape)
	hashShapes := make(map[uint64]Shape)

	for _, typeSpec := range spec.Types {
		hashCode := typeSpec.HashCode()
    if _, ok := hashShapes[hashCode]; ok {
      log.Println("memdrive already registered", typeSpec.Name, hashCode)
    }

    log.Println("registering", typeSpec, hashCode)
    hashShapes[hashCode] = &memoryShape{
      //spec:
    }
	}

	return typeIdxs, nil
}

func (bd *MemoryDrive) Close() error {
	return nil
}

type memoryBucket struct {
}

var _ Bucket = (*memoryBucket)(nil)

func (b *memoryBucket)	GetRoot() base.Folder {
  return nil
}
func (b *memoryBucket)	GetShape() Shape {
  return nil
}


type memoryShape struct {
}

var _ Shape = (*memoryShape)(nil)

func (s *memoryShape) Validate(entry base.Entry) error {
  return nil
}
