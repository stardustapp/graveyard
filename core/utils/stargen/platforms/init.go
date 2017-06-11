package platforms

import (
	stargen "github.com/stardustapp/core/utils/stargen/common"
)

func CountPlatforms() int {
	return len(stargen.Platforms)
}
