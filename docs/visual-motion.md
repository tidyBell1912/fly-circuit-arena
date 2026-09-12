# Visual motion and interpretation

The body is the actual NeuroMechFly v2 mesh and rig, not an AI-generated anatomy image. See the separate asset provenance and licenses.

The walk and run files are 96-frame procedural gait tables fitted to foot-tip targets using the real forward-kinematics model. They alternate the lf/rm/lh and rf/lm/rh tripod groups. The source target-fit errors were below 0.0006 mm. That geometric fit is not a validation of natural behavior, dynamics, collision avoidance or biomechanics. Timing in the display is artistic and is not measured locomotion.

The flying pose draws legs inward. Wings spread approximately −75 degrees on the left and +75 degrees on the right, with same-phase pitch oscillation. The slow visible wing cycle is chosen for readability and does not reproduce a fly's physical wingbeat frequency.

During decision phases, flies patrol without revealing private routes. Once a server event discloses choices, each follows the selected route to a sugar vault. Same-vault choices show interception; differing choices show an escape. The winner carries sugar; all three receive visible feedback halos. Those halos correspond to modeled reward signals, not measured dopamine.

The camera and animation never decide an outcome. Everyone sees the same committed choices and winner, while frame timing and camera angle can differ. Dragging the camera, recording a clip or changing language does not change the game.

The 30-second round allocates 4 seconds to Mica's prediction, 6 to actor decisions, 2 to sealed routes, 12 to the action sequence, and 6 to feedback. A recording is produced from the next real round and includes the match identifier. It is not a selected synthetic victory sequence.
