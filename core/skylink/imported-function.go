package skylink

import (
	"log"

	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/extras"
)

type importedFunction struct {
	svc  *nsimport
	path string
	name string
}

var _ base.Function = (*importedFunction)(nil)

func (e *importedFunction) Name() string {
	return e.name
}
func (e *importedFunction) Invoke(ctx base.Context, input base.Entry) (output base.Entry) {

	// TODO: only set dest if we want to be stateful
	dest := "/tmp/output-" + extras.GenerateId()

	resp, err := e.svc.transport.exec(nsRequest{
		Op:    "invoke",
		Path:  e.path,
		Input: convertEntryToApi(input),
		Dest:  dest,
	})
	if err != nil {
		log.Println("nsimport invoke err:", err)
		return nil
	}
	if !resp.Ok {
		log.Println("nsimport invoke of", e.path, "wasn't okay")
		return nil
	}

	if dest == "" {
		return convertEntryFromApi(resp.Output)
	} else {
		output, _ := e.svc.getEntry(dest)
		return output
	}
}
