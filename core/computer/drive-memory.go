package computer

import (
	"log"
	"sync"

	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/computer/schema"
)

// Memory drives are a volatile StarDrive implementation
// They never persist anything outside of the process, like RAM disks
// This means there's no concerns about serialization or disk migrations

func newMemoryDrive() *MemoryDrive {
	return &MemoryDrive{
		env: base.NewEnvironment(),
		//specs: make(map[string]*schema.SchemaSpec),
		shapes: make(map[int]*memoryShape),
	}
}

type MemoryDrive struct {
	//specs map[string]*schema.SchemaSpec
	env        *base.Environment
	shapes     map[int]*memoryShape
	shapeMutex sync.Mutex
}

var _ Drive = (*MemoryDrive)(nil)

func (d *MemoryDrive) InstallSpec(name string, spec *schema.SchemaSpec) (map[string]Shape, error) {
	d.shapeMutex.Lock()
	defer d.shapeMutex.Unlock()
	log.Println("bolt-drive: installing spec", name, "from", spec.Origin)

	typeIdxs := make(map[string]Shape)
	hashShapes := make(map[uint64]Shape)

	for _, typeSpec := range spec.Types {
		hashCode := typeSpec.HashCode()
		if _, ok := hashShapes[hashCode]; ok {
			log.Println("memdrive already registered", typeSpec.Name, hashCode)
			continue
		}

		typeBrowser, err := d.env.Browse("type://" + name + ".package.local/types/" + typeSpec.Name)
		if err != nil {
			return nil, err
		}

		log.Println("registering", typeSpec, hashCode)
		_, err = typeSpec.Compile(typeBrowser)
		if err != nil {
			return nil, err
		}

		hashShapes[hashCode] = &memoryShape{
		//spec:
		}
	}

	return typeIdxs, nil
}

func (d *MemoryDrive) Close() error {
	return nil
}

type memoryBucket struct {
}

var _ Bucket = (*memoryBucket)(nil)

func (b *memoryBucket) GetRoot() base.Folder {
	return nil
}
func (b *memoryBucket) GetShape() Shape {
	return nil
}

type memoryShape struct {
}

var _ Shape = (*memoryShape)(nil)

func (s *memoryShape) Validate(entry base.Entry) error {
	return nil
}
