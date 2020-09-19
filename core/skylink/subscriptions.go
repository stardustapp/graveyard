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
	StopC    chan struct{}     // closed by downstream when the sub should no longer be active
	StreamC  chan Notification // kept open to prevent panics
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
		StopC:    make(chan struct{}, 1),
	}
}

func (s *Subscription) Run() error {
	if s.StreamC != nil {
		panic("Subscription is already running")
	}
	s.StreamC = make(chan Notification, 5)

	return s.subscribe(s.root)
}

func (s *Subscription) SendNotification(nType, path string, node base.Entry) {
	log.Println("nsapi: Sending", nType, "notification on", path, "w/", node)

	s.StreamC <- Notification{
		Type:  nType,
		Path:  path,
		Entry: node,
	}
}

// Shuts down the downstream notification channel
// Only the upstream should call this
func (s *Subscription) Close() {
	log.Println("nsapi: Closing subscription notification channel")
	close(s.StreamC)
}

func (s *Subscription) subscribe(src base.Entry) error {
	if subscribable, ok := src.(Subscribable); ok {
		log.Println("skylink: Asking", src.Name(), "to self-subscribe")
		if err := subscribable.Subscribe(s); err == nil {
			log.Println("skylink: Subscribable accepted the sub")
			return nil
		} else {
			close(s.StopC)
			log.Println("skylink: Subscribable rejected sub:", err)
			return err
		}
	}

	close(s.StopC)
	log.Println("skylink: Entry isn't subscribable")
	return errors.New("skylink: Entry isn't subscribable")
}
