'use strict';

const Record = Editor.require('app://editor/share/engine-extends/record-object');

/**
 * info = {
 *   before: [{id, data}],
 *   after: [{id, data}],
 * }
 */
class RecordObjectsCommand extends Editor.Undo.Command {
    undo () {
        let nodeIDs = [];
        for ( let i = this.info.before.length-1; i >= 0; --i ) {
            let objInfo = this.info.before[i];
            let obj = cc.engine.getInstanceById(objInfo.id);

            Record.RestoreObject( obj, objInfo.data );

            //
            let node = null;
            if ( obj instanceof cc.ENode ) {
                node = obj;
            } else if ( obj instanceof cc.Component ) {
                node = obj.node;
            }

            //
            if ( node && nodeIDs.indexOf( node.uuid ) === -1 ) {
                nodeIDs.push( node.uuid );
            }

            Editor.Selection.select( 'node', nodeIDs );
        }
    }

    redo () {
        let nodeIDs = [];
        for ( let i = 0; i < this.info.after.length; ++i ) {
            let objInfo = this.info.after[i];
            let obj = cc.engine.getInstanceById(objInfo.id);

            Record.RestoreObject( obj, objInfo.data );

            //
            let node = null;
            if ( obj instanceof cc.ENode ) {
                node = obj;
            } else if ( obj instanceof cc.Component ) {
                node = obj.node;
            }

            //
            if ( node && nodeIDs.indexOf( node.uuid ) === -1 ) {
                nodeIDs.push( node.uuid );
            }

            Editor.Selection.select( 'node', nodeIDs );
        }
    }
}

/**
 * info = {
 *   list: [{node, parent, siblingIndex}]
 * }
 */
class CreateNodesCommand extends Editor.Undo.Command {
    undo () {
        let nodeIDs = [];
        for ( let i = this.info.list.length-1; i >= 0; --i ) {
            let info = this.info.list[i];

            info.node.parent = null;
            nodeIDs.push(info.node.uuid);
        }
        Editor.Selection.unselect('node', nodeIDs);
    }

    redo () {
        let nodeIDs = [];
        for ( let i = 0; i < this.info.list.length; ++i ) {
            let info = this.info.list[i];

            info.node.parent = info.parent;
            info.node.setSiblingIndex(info.siblingIndex);
            nodeIDs.push(info.node.uuid);
        }
        Editor.Selection.select('node', nodeIDs);
    }
}

/**
 * info = {
 *   list: [{node, parent, siblingIndex}]
 * }
 */
class DeleteNodesCommand extends Editor.Undo.Command {
    undo () {
        let nodeIDs = [];
        for ( let i = this.info.list.length-1; i >= 0; --i ) {
            let info = this.info.list[i];

            info.node.parent = info.parent;
            info.node.setSiblingIndex(info.siblingIndex);
            nodeIDs.push(info.node.uuid);
        }
        Editor.Selection.select('node', nodeIDs);
    }

    redo () {
        let nodeIDs = [];
        for ( let i = 0; i < this.info.list.length; ++i ) {
            let info = this.info.list[i];

            info.node.parent = null;
            nodeIDs.push(info.node.uuid);
        }
        Editor.Selection.unselect('node', nodeIDs);
    }
}

/**
 * info = {
 *   list: [{node, parent, siblingIndex}]
 * }
 */
class MoveNodesCommand extends Editor.Undo.Command {
    static moveNode ( node, parent, siblingIndex ) {
        if (node.parent !== parent) {
            // keep world transform not changed
            var worldPos = node.worldPosition;
            var worldRotation = node.worldRotation;
            var lossyScale = node.worldScale;

            node.parent = parent;

            // restore world transform
            node.worldPosition = worldPos;
            node.worldRotation = worldRotation;
            if (parent) {
                lossyScale.x /= parent.worldScale.x;
                lossyScale.y /= parent.worldScale.y;
                node.scale = lossyScale;
            } else {
                node.scale = lossyScale;
            }
        }

        node.setSiblingIndex(siblingIndex);
    }

    undo () {
        let nodeIDs = [];
        for ( let i = this.info.before.length-1; i >= 0; --i ) {
            let info = this.info.before[i];

            MoveNodesCommand.moveNode(info.node, info.parent, info.siblingIndex);
            nodeIDs.push(info.node.uuid);
        }
        Editor.Selection.select('node', nodeIDs);
    }

    redo () {
        let nodeIDs = [];
        for ( let i = 0; i < this.info.after.length; ++i ) {
            let info = this.info.after[i];

            MoveNodesCommand.moveNode(info.node, info.parent, info.siblingIndex);
            nodeIDs.push(info.node.uuid);
        }
        Editor.Selection.select('node', nodeIDs);
    }
}

/**
 * SceneUndo
 */

let _currentCreatedRecords = [];
let _currentDeletedRecords = [];
let _currentMovedRecords = [];
let _currentObjectRecords = [];
let _undo = Editor.Undo.local();

let SceneUndo = {
    init () {
        _undo.register( 'record-objects', RecordObjectsCommand );
        _undo.register( 'create-nodes', CreateNodesCommand );
        _undo.register( 'delete-nodes', DeleteNodesCommand );
        _undo.register( 'move-nodes', MoveNodesCommand );

        _currentCreatedRecords = [];
        _currentDeletedRecords = [];
        _currentMovedRecords = [];
        _currentObjectRecords = [];
    },

    recordObject ( id, desc ) {
        if ( desc ) {
            _undo.setCurrentDescription(desc);
        }

        // only record object if it has not recorded yet
        let exists = _currentObjectRecords.some( record => {
            return record.id === id;
        });
        if ( !exists ) {
            let obj = cc.engine.getInstanceById(id);
            let data = Record.RecordObject(obj);

            _currentObjectRecords.push({
                id: id,
                data: data,
            });
        }
    },

    recordCreateNode ( id, desc ) {
        if ( desc ) {
            _undo.setCurrentDescription(desc);
        }

        // only record object if it has not recorded yet
        let exists = _currentCreatedRecords.some(record => {
            return record.node.id === id;
        });
        if ( !exists ) {
            let node = cc.engine.getInstanceById(id);
            _currentCreatedRecords.push({
                node: node,
                parent: node.parent,
                siblingIndex: node.getSiblingIndex(),
            });
        }
    },

    recordDeleteNode ( id, desc ) {
        if ( desc ) {
            _undo.setCurrentDescription(desc);
        }

        // only record object if it has not recorded yet
        let exists = _currentDeletedRecords.some(record => {
            return record.node.id === id;
        });
        if ( !exists ) {
            let node = cc.engine.getInstanceById(id);
            _currentDeletedRecords.push({
                node: node,
                parent: node.parent,
                siblingIndex: node.getSiblingIndex(),
            });
        }
    },

    recordMoveNode ( id, desc ) {
        if ( desc ) {
            _undo.setCurrentDescription(desc);
        }

        // only record object if it has not recorded yet
        let exists = _currentMovedRecords.some(record => {
            return record.node.id === id;
        });
        if ( !exists ) {
            let node = cc.engine.getInstanceById(id);
            _currentMovedRecords.push({
                node: node,
                parent: node.parent,
                siblingIndex: node.getSiblingIndex(),
            });
        }
    },

    commit () {
        // flush created records
        if ( _currentCreatedRecords.length ) {
            _undo.add('create-nodes', {
                list: _currentCreatedRecords
            });

            _currentCreatedRecords = [];
        }

        // flush records
        if ( _currentObjectRecords.length ) {
            let beforeList = _currentObjectRecords;
            let afterList = _currentObjectRecords.map( record => {
                let obj = cc.engine.getInstanceById(record.id);
                return {
                    id: record.id,
                    data: Record.RecordObject(obj),
                };
            });

            _undo.add('record-objects', {
                before: beforeList,
                after: afterList,
            });

            _currentObjectRecords = [];
        }

        // flush move records
        if ( _currentMovedRecords.length ) {
            let beforeList = _currentMovedRecords;
            let afterList = _currentMovedRecords.map( record => {
                return {
                    node: record.node,
                    parent: record.node.parent,
                    siblingIndex: record.node.getSiblingIndex(),
                };
            });

            _undo.add('move-nodes', {
                before: beforeList,
                after: afterList,
            });

            _currentMovedRecords = [];
        }

        // flush deleted records
        if ( _currentDeletedRecords.length ) {
            _undo.add('delete-objects', {
                list: _currentDeletedRecords
            });

            _currentDeletedRecords = [];
        }

        //
        _undo.commit();
    },

    undo () {
        _undo.undo();
        cc.engine.repaintInEditMode();
    },

    redo () {
        _undo.redo();
        cc.engine.repaintInEditMode();
    },
};

module.exports = SceneUndo;
