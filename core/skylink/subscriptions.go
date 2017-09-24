package skylink

import (
	"fmt"
	"log"

	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/inmem"
)

// Represents an individual request to receive change notifications
type Subscription struct {
	root     base.Entry
	maxDepth int
	cancelC  chan struct{}     // closed when the sub is terminated
	streamC  chan Notification // kept open to prevent panics. TODO: close later
}

// A resource that is natively subscribable.
// It'll take care of itself + children
type Subscribable interface {
	Subscribe(s *Subscription, depth int, prefix string) (ok bool)
}

// A wire notification representing a data or state observation
type Notification struct {
	Type  string
	Path  string
	Entry base.Entry
}

func NewSubscription(root base.Entry, maxDepth int) *Subscription {
	return &Subscription{
		root:     root,
		maxDepth: maxDepth,
		cancelC:  make(chan struct{}),
	}
}

func (s *Subscription) Run() {
	if s.streamC != nil {
		panic("Subscription is already running")
	}
	s.streamC = make(chan Notification, 5)

	go s.subscribe(0, "", s.root)
}

func (s *Subscription) SendNotification(nType, path string, node base.Entry) {
	log.Println("nsapi: Sending", nType, "notification on", path, "w/", node)

	s.streamC <- Notification{
		Type:  nType,
		Path:  path,
		Entry: node,
	}
}

func (s *Subscription) subscribe(depth int, path string, src base.Entry) {
	var prefix string
	if path != "" {
		prefix = path + "/"
	}

	handled := false
	if subscribable, ok := src.(Subscribable); ok {
		log.Println("skylink: Asking", src.Name(), "at", path, "to self-subscribe")
		handled = subscribable.Subscribe(s, depth, prefix)
	}

	/*
		// Recurse if the thing is a Folder and we have depth
		if depth < s.maxDepth || s.maxDepth == -1 {
			if entry, ok := src.(base.Folder); ok {
				for _, name := range entry.Children() {
					child, ok := entry.Fetch(name)
					if ok {
						e.enumerate(depth+1, strings.TrimPrefix(path+"/"+name, "/"), child)
					} else {
						log.Println("enumerate: Couldn't get", name, "from", path)
					}
				}
			}
		}
	*/

	if !handled {
		s.SendNotification("error", "", inmem.NewString("nosub",
			fmt.Sprintf("Entry at path %q isn't subscribable", path)))
		log.Printf("nsapi: Entry at path %q isn't subscribable", path)
		close(s.cancelC)
		return
	}

	// Mark ready if we're the last thing
	if depth == 0 {
		s.SendNotification("ready", "", nil)
	}
}
