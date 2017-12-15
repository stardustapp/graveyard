package computer

import (
	"log"
  "sync"

  "github.com/stardustapp/core/computer/schema"
)

func newMemoryDrive() (*MemoryDrive) {
  return &MemoryDrive{
    //specs: make(map[string]*schema.SchemaSpec),
    shapes: make(map[int]*memoryShape),
  }
}

type MemoryDrive struct {
  //specs map[string]*schema.SchemaSpec
  shapes map[int]*memoryShape
  shapeMutex sync.Mutex
}

func (bd *MemoryDrive) InstallSpec(name string, spec *schema.SchemaSpec) (map[string]*memoryShape, error) {
  bd.shapeMutex.Lock()
  defer bd.shapeMutex.Unlock()
  log.Println("bolt-drive: installing spec", name, "from", spec.Origin)

  typeIdxs := make(map[string]*memoryShape)
  //hashShapes := make(map[string]uint64)

  for _, typeSpec := range spec.Types {
    log.Println("hi", typeSpec.Name, typeSpec.HashCode())
  }

  return typeIdxs, nil
}

// probably similar to gob's wire, maybe
type memoryShape struct {

}

func (bd *MemoryDrive) Close() error {
  return nil
}
