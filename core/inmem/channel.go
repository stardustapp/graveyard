package inmem

import (
	"github.com/stardustapp/core/base"
)

// Manages an in-memory Channel structure
// Channels get Closed instead of Frozen
// A closed channel will not accept any more entries
// TODO: allow restricting channel contents by type/etc?
type Channel struct {
	name     string
	writable bool
	channel  chan base.Entry
}

var _ base.Channel = (*Channel)(nil)

func NewSyncChannel(name string) *Channel {
	return &Channel{
		name:     name,
		writable: true,
		channel:  make(chan base.Entry),
	}
}

func NewBufferedChannel(name string, buffer int) *Channel {
	return &Channel{
		name:     name,
		writable: true,
		channel:  make(chan base.Entry, buffer),
	}
}

// Prevents this channel from ever receiving new entries
func (e *Channel) Close() {
	if e.writable {
		close(e.channel)
	}
	e.writable = false
}

func (e *Channel) Name() string {
	return e.name
}

func (e *Channel) Push(value base.Entry) (ok bool) {
	if e.writable {
		e.channel <- value
		ok = true
	}
	return
}

func (e *Channel) Next() (value base.Entry, ok bool) {
	value, ok = <-e.channel
	return
}

func (e *Channel) TryNext() (value base.Entry, ok bool) {
	select {
	case value, ok = <-e.channel:
		return
	default:
		return nil, false
	}
}
