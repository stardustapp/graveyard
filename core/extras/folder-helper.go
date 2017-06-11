package extras

import (
	"log"

	"github.com/stardustapp/core/base"
)

func GetChildString(folder base.Folder, name string) (value string, ok bool) {
	entry, ok := folder.Fetch(name)
	if !ok {
		if name != "optional" {
			log.Println("missed lookup for", name, "in", folder.Name())
		}
		return "", false
	}

	str, ok := entry.(base.String)
	if !ok {
		log.Println("wanted string, got something else from", name)
		return "", false
	}

	return str.Get(), true
}
