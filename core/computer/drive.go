package computer

import (
	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/computer/schema"
)

// Inferface for accessing typed buckets of data.

type Drive interface {
	InstallSpec(name string, spec *schema.SchemaSpec) (map[string]Shape, error)
	CreateBucket(name string, rootType Shape) (Bucket, error)
	GetBucket(name string) (Bucket, error)
	Close() error
}

type Bucket interface {
	GetRoot() base.Folder

	//UpdateShape
	//ShapeSummary() map[Shape]int
	// TODO: bucket maintanence, eg migrations
}

type Shape interface {
	Validate(entry base.Entry) error
}
