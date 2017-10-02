package skylink

import (
	"errors"
	"log"

	"github.com/stardustapp/core/base"
)

// Represents an individual request to receive change notifications
type Subscription struct {
	root     base.Entry
	MaxDepth int
	cancelC  chan struct{}     // closed when the sub is terminated
	streamC  chan Notification // kept open to prevent panics. TODO: close later
}

// A resource that is natively subscribable.
// It'll take care of itself + children
type Subscribable interface {
	Subscribe(s *Subscription) (err error)
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
		MaxDepth: maxDepth,
		cancelC:  make(chan struct{}),
	}
}

func (s *Subscription) Run() error {
	if s.streamC != nil {
		panic("Subscription is already running")
	}
	s.streamC = make(chan Notification, 5)

	return s.subscribe(s.root)
}

func (s *Subscription) SendNotification(nType, path string, node base.Entry) {
	log.Println("nsapi: Sending", nType, "notification on", path, "w/", node)

	s.streamC <- Notification{
		Type:  nType,
		Path:  path,
		Entry: node,
	}
}

func (s *Subscription) subscribe(src base.Entry) error {
	if subscribable, ok := src.(Subscribable); ok {
		log.Println("skylink: Asking", src.Name(), "to self-subscribe")
		if err := subscribable.Subscribe(s); err == nil {
			log.Println("skylink: Subscribable accepted the sub")
			// TODO: subscribable should do this
			//s.SendNotification("ready", "", nil)
			return nil
		} else {
			log.Println("skylink: Subscribable rejected sub:", err)
			close(s.cancelC)
			return err
		}
	}

	close(s.cancelC)
	return errors.New("skylink: Entry isn't subscribable")
}
