import { useState, useEffect } from 'react';
import { Trash2, Edit } from 'lucide-react';
import { usaStates, getStatesByAbbrs, calculateGroupCenter, combineStatePaths } from '../data/usaStates';
import { getCountiesForStates, calculateCountyGroupCenter, combineCountyPaths } from '../data/countyData';
import { MAPS_BY_MAPSET } from '../data/territories';
import { Modal, SectionHead, EmptyState } from './ui/Primitives';
import { useDialog } from './ui/Dialog';

const MapEditor = ({ isOpen, onClose, onSave, existingCampaign = null }) => {
  const [selectedStates, setSelectedStates] = useState(new Set());
  const [territories, setTerritories] = useState([]);
  const [hoveredState, setHoveredState] = useState(null);
  const [editingTerritory, setEditingTerritory] = useState(null);
  const [editingTerritoryComponents, setEditingTerritoryComponents] = useState(null);
  const [selectedComponentsForMerge, setSelectedComponentsForMerge] = useState(new Set());
  const [mergeTargetTerritory, setMergeTargetTerritory] = useState(null);
  const [selectedTerritoriesForMerge, setSelectedTerritoriesForMerge] = useState(new Set());
  const [multiSelectStates, setMultiSelectStates] = useState(new Set());
  const [mapMode, setMapMode] = useState('states'); // 'states' or 'counties'
  const [showStateSelector, setShowStateSelector] = useState(false);
  const [selectedStatesForCounties, setSelectedStatesForCounties] = useState(new Set());
  const [countyData, setCountyData] = useState(null);
  const [isCountyMode, setIsCountyMode] = useState(false);
  // County-specific state
  const [selectedCounties, setSelectedCounties] = useState(new Set());
  const [hoveredCounty, setHoveredCounty] = useState(null);
  const [multiSelectCounties, setMultiSelectCounties] = useState(new Set());

  // Zoom and pan state
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Drag selection state
  const [isDraggingSelect, setIsDraggingSelect] = useState(false);
  const [isDraggingMerge, setIsDraggingMerge] = useState(false);
  const [draggedItems, setDraggedItems] = useState(new Set());
  const [justDragged, setJustDragged] = useState(false);

  const { notice } = useDialog();

  const mapsByMapset = MAPS_BY_MAPSET;

  // Flatten all maps for the select dropdown

  useEffect(() => {
    const loadExistingMap = async () => {
      if (existingCampaign?.customMap) {
        // Load existing custom map
        setTerritories(existingCampaign.customMap.territories);
        const allStates = new Set();
        existingCampaign.customMap.territories.forEach(t => {
          if (t.states) {
            t.states.forEach(s => allStates.add(s));
          }
        });
        setSelectedStates(allStates);
      } else if (existingCampaign?.territories) {
        // Check if this is a county-based map
        const hasCountyTerritories = existingCampaign.territories.some(
          t => t.isCountyBased || t.countyPaths || t.counties || t.countyFips
        );

        if (hasCountyTerritories) {
          // COUNTY MODE: Preserve county-based territories
          const countyTerritories = existingCampaign.territories.filter(
            t => t.isCountyBased || t.countyPaths || t.counties || t.countyFips
          );

          // Extract unique state abbreviations from county IDs or FIPS codes
          const stateFipsToAbbr = {
            '01': 'AL', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT',
            '10': 'DE', '11': 'DC', '12': 'FL', '13': 'GA', '16': 'ID', '17': 'IL',
            '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME', '24': 'MD',
            '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT', '31': 'NE',
            '32': 'NV', '33': 'NH', '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND',
            '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD',
            '47': 'TN', '48': 'TX', '49': 'UT', '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV',
            '55': 'WI', '56': 'WY'
          };
          const statesSet = new Set();
          countyTerritories.forEach(t => {
            // Handle countyFips (5-digit FIPS codes)
            if (t.countyFips) {
              t.countyFips.forEach(fips => {
                const stateFips = fips.substring(0, 2);
                const stateAbbr = stateFipsToAbbr[stateFips];
                if (stateAbbr) statesSet.add(stateAbbr);
              });
            }
            // Handle counties (STATE_CountyName format)
            if (t.counties) {
              t.counties.forEach(countyId => {
                const stateAbbr = countyId.split('_')[0];
                if (stateAbbr) statesSet.add(stateAbbr);
              });
            }
            // Handle stateAbbr directly
            if (t.stateAbbr) {
              statesSet.add(t.stateAbbr);
            }
          });

          if (statesSet.size > 0) {
            try {
              // Load county data for the detected states
              const stateAbbrs = Array.from(statesSet);
              const countyDataForStates = await getCountiesForStates(stateAbbrs);

              // Build FIPS to county ID mapping
              const fipsToCountyId = {};
              countyDataForStates.counties.forEach(county => {
                if (county.fips) {
                  fipsToCountyId[county.fips] = county.id;
                }
              });

              // Set up county mode
              setCountyData(countyDataForStates);
              setIsCountyMode(true);
              setMapMode('counties');
              setSelectedStatesForCounties(statesSet);

              // Load territories with county data, converting countyFips to counties
              const loadedTerritories = countyTerritories.map(t => {
                // Convert countyFips to counties format if needed
                let counties = t.counties || [];
                if (t.countyFips && t.countyFips.length > 0) {
                  counties = t.countyFips
                    .map(fips => fipsToCountyId[fips])
                    .filter(Boolean); // Remove any unmapped FIPS
                }

                return {
                  ...t,
                  id: t.id || `territory-${Date.now()}-${Math.random()}`,
                  counties, // Use converted counties
                  victoryPoints: t.victoryPoints || t.pointValue || 1,
                  owner: t.owner,
                  initialOwner: t.owner,
                  maps: t.maps || [],
                  isCountyBased: true
                };
              });

              setTerritories(loadedTerritories);

              // Mark counties as selected
              const allCounties = new Set();
              loadedTerritories.forEach(t => {
                if (t.counties) {
                  t.counties.forEach(c => allCounties.add(c));
                }
              });
              setSelectedCounties(allCounties);
            } catch (error) {
              console.error('Error loading county data for existing map:', error);
              await notice({
                title: 'Could not load county data',
                body: 'The county data did not load. Switching to the state view.',
              });
              // Fall back to state mode
              loadStateMode();
            }
          } else {
            // No valid state data found, fall back
            loadStateMode();
          }
        } else {
          // STATE MODE: Load state-based territories
          loadStateMode();
        }
      }
    };

    const loadStateMode = () => {
      const loadedTerritories = existingCampaign.territories.map(t => {
        // Find matching state by comparing SVG paths or by ID
        const matchingState = usaStates.find(s =>
          s.abbreviation === t.id?.toUpperCase() ||
          s.name === t.name ||
          s.svgPath === t.svgPath
        );
        
        // Spread first so nothing the editor does not know about (capital,
        // terrain weights, borders, water, urban) is dropped on the way in.
        return {
          ...t,
          id: t.id || `territory-${Date.now()}-${Math.random()}`,
          name: t.name,
          victoryPoints: t.victoryPoints || t.pointValue || 1,
          owner: t.owner,
          initialOwner: t.owner,
          maps: t.maps || [],
          states: matchingState ? [matchingState.abbreviation] : (t.states || []),
          svgPath: t.svgPath || '',
          center: t.center || { x: 0, y: 0 },
        };
      });
      setTerritories(loadedTerritories);
      
      // Select all states that are part of territories
      const allStates = new Set();
      loadedTerritories.forEach(t => {
        if (t.states && t.states.length > 0) {
          t.states.forEach(s => allStates.add(s));
        }
      });
      setSelectedStates(allStates);
    };

    loadExistingMap();
  }, [existingCampaign, notice]);

  const handleStateClick = (stateAbbr, ctrlKey = false) => {
    // Ignore clicks right after a drag
    if (justDragged) return;

    // If we're editing a territory, add this state to it
    if (editingTerritoryComponents && !editingTerritoryComponents.isCountyBased) {
      const territory = editingTerritoryComponents;
      
      // Check if state is already in this territory
      if (territory.states && territory.states.includes(stateAbbr)) {
        return; // Already in this territory
      }
      
      // Check if state is in another territory
      const existingTerritory = territories.find(t =>
        t.id !== territory.id && t.states && t.states.includes(stateAbbr)
      );
      
      if (existingTerritory) {
        // State is in another territory - can't add directly
        return;
      }
      
      // Add state to the editing territory
      setTerritories(prev => prev.map(t => {
        if (t.id === territory.id) {
          const newStates = [...(t.states || []), stateAbbr];
          return {
            ...t,
            states: newStates,
            svgPath: combineStatePaths(newStates),
            center: calculateGroupCenter(newStates),
            name: getStatesByAbbrs(newStates).map(s => s.name).join(' & ')
          };
        }
        return t;
      }));
      
      // Update selected states
      setSelectedStates(prev => new Set([...prev, stateAbbr]));
      
      // Update the editing territory reference
      setEditingTerritoryComponents(prev => ({
        ...prev,
        states: [...(prev.states || []), stateAbbr]
      }));
      
      return;
    }

    if (ctrlKey) {
      // Find territory containing this state
      const territory = territories.find(t => t.states && t.states.includes(stateAbbr));
      
      if (territory && territory.states.length > 1) {
        // Ctrl+Click on merged territory: Split it
        splitTerritory(territory);
        setMultiSelectStates(new Set());
      } else if (!territory) {
        // Ctrl+Click on non-selected state: Select it first, then add to multi-select
        const newSelected = new Set(selectedStates);
        newSelected.add(stateAbbr);

        const state = usaStates.find(s => s.abbreviation === stateAbbr);
        const newTerritory = {
          id: `territory-${Date.now()}`,
          name: state.name,
          states: [stateAbbr],
          victoryPoints: 1,
          maps: [],
          owner: 'NEUTRAL',
          initialOwner: 'NEUTRAL',
          svgPath: state.svgPath,
          center: state.center
        };
        setTerritories([...territories, newTerritory]);
        setSelectedStates(newSelected);
        
        // Add to multi-select
        const newMultiSelect = new Set(multiSelectStates);
        newMultiSelect.add(stateAbbr);
        setMultiSelectStates(newMultiSelect);
        
        // If we have 2+ states selected, merge them (but keep multi-select active)
        if (newMultiSelect.size >= 2) {
          mergeSelectedStates(newMultiSelect);
          // Don't clear multi-select - keep it for adding more states
        }
      } else {
        // Ctrl+Click on single state territory: Add to multi-select for merging
        const newMultiSelect = new Set(multiSelectStates);
        
        if (newMultiSelect.has(stateAbbr)) {
          // Already selected, remove it
          newMultiSelect.delete(stateAbbr);
        } else {
          // Add to multi-select
          newMultiSelect.add(stateAbbr);
        }
        
        setMultiSelectStates(newMultiSelect);
        
        // If we have 2+ states selected, merge them (but keep multi-select active)
        if (newMultiSelect.size >= 2) {
          mergeSelectedStates(newMultiSelect);
          // Don't clear multi-select - keep it for adding more states
        }
      }
    } else {
      // Normal click: toggle state selection
      const newSelected = new Set(selectedStates);
      
      if (newSelected.has(stateAbbr)) {
        // Remove state from selection and any territories
        newSelected.delete(stateAbbr);
        setTerritories(territories.filter(t => !t.states.includes(stateAbbr)));
      } else {
        // Add state to selection
        newSelected.add(stateAbbr);
        
        // Create a new territory for this state
        const state = usaStates.find(s => s.abbreviation === stateAbbr);
        const newTerritory = {
          id: `territory-${Date.now()}`,
          name: state.name,
          states: [stateAbbr],
          victoryPoints: 1,
          maps: [],
          owner: 'NEUTRAL',
          initialOwner: 'NEUTRAL',
          svgPath: state.svgPath,
          center: state.center
        };
        setTerritories([...territories, newTerritory]);
      }
      
      setSelectedStates(newSelected);
      setMultiSelectStates(new Set()); // Clear multi-select on normal click
    }
  };

  const mergeSelectedStates = (statesToMerge) => {
    const stateArray = Array.from(statesToMerge);

    // Use callback to work with latest state
    setTerritories(prev => {
      // Find all territories that contain these states
      const affectedTerritories = prev.filter(t =>
        t.states && t.states.some(s => stateArray.includes(s))
      );

      if (affectedTerritories.length === 0) return prev;

      // Collect all states from affected territories
      const allStates = [...new Set(affectedTerritories.flatMap(t => t.states))];

      // Create merged territory
      const mergedName = affectedTerritories.map(t => t.name).join(' & ');
      const mergedTerritory = {
        id: `territory-${Date.now()}`,
        name: mergedName,
        states: allStates,
        victoryPoints: Math.max(...affectedTerritories.map(t => t.victoryPoints)),
        maps: [...new Set(affectedTerritories.flatMap(t => t.maps || []))],
        owner: affectedTerritories[0].owner || affectedTerritories[0].initialOwner,
        initialOwner: affectedTerritories[0].owner || affectedTerritories[0].initialOwner,
        svgPath: combineStatePaths(allStates),
        center: calculateGroupCenter(allStates)
      };

      // Remove old territories and add merged one
      const remainingTerritories = prev.filter(t => !affectedTerritories.includes(t));
      return [...remainingTerritories, mergedTerritory];
    });
  };

  const splitTerritory = (territory) => {
    // Remove the merged territory
    const remainingTerritories = territories.filter(t => t.id !== territory.id);
    
    // Create individual territories for each state
    const newTerritories = territory.states.map(stateAbbr => {
      const state = usaStates.find(s => s.abbreviation === stateAbbr);
      return {
        id: `territory-${Date.now()}-${stateAbbr}`,
        name: state.name,
        states: [stateAbbr],
        victoryPoints: 1,
        maps: [],
        owner: territory.owner || territory.initialOwner,
        initialOwner: territory.owner || territory.initialOwner,
        svgPath: state.svgPath,
        center: state.center
      };
    });
    
    setTerritories([...remainingTerritories, ...newTerritories]);
  };

  const handleTerritoryUpdate = (territoryId, field, value) => {
    setTerritories(territories.map(t => 
      t.id === territoryId ? { ...t, [field]: value } : t
    ));
  };


  const handleDeleteTerritory = (territoryId) => {
    const territory = territories.find(t => t.id === territoryId);
    if (territory) {
      if (territory.isCountyBased && territory.counties) {
        // County-based territory
        const newSelected = new Set(selectedCounties);
        territory.counties.forEach(c => newSelected.delete(c));
        setSelectedCounties(newSelected);
      } else if (territory.states) {
        // State-based territory
        const newSelected = new Set(selectedStates);
        territory.states.forEach(s => newSelected.delete(s));
        setSelectedStates(newSelected);
      }
      setTerritories(territories.filter(t => t.id !== territoryId));
    }
  };

  const handleEditTerritoryComponents = (territory) => {
    setEditingTerritoryComponents(territory);
    setSelectedComponentsForMerge(new Set());
    setMergeTargetTerritory(null);
    setSelectedTerritoriesForMerge(new Set());
  };

  const handleCloseEditComponents = () => {
    setEditingTerritoryComponents(null);
    setSelectedComponentsForMerge(new Set());
    setMergeTargetTerritory(null);
    setSelectedTerritoriesForMerge(new Set());
  };

  const toggleComponentSelection = (componentId) => {
    const newSelection = new Set(selectedComponentsForMerge);
    if (newSelection.has(componentId)) {
      newSelection.delete(componentId);
    } else {
      newSelection.add(componentId);
    }
    setSelectedComponentsForMerge(newSelection);
  };

  const toggleTerritorySelection = (territoryId) => {
    const newSelection = new Set(selectedTerritoriesForMerge);
    if (newSelection.has(territoryId)) {
      newSelection.delete(territoryId);
    } else {
      newSelection.add(territoryId);
    }
    setSelectedTerritoriesForMerge(newSelection);
  };

  const handleMergeTerritoriesIntoEditing = async () => {
    if (!editingTerritoryComponents || selectedTerritoriesForMerge.size === 0) {
      return;
    }

    const targetTerritory = editingTerritoryComponents;
    const selectedTerritoryIds = Array.from(selectedTerritoriesForMerge);
    const territoriesToMerge = territories.filter(t => selectedTerritoryIds.includes(t.id));

    // Verify all territories are the same type (state-based or county-based)
    const isCountyBased = targetTerritory.isCountyBased;
    const allSameType = territoriesToMerge.every(t => !!t.isCountyBased === !!isCountyBased);
    
    if (!allSameType) {
      await notice({
        title: 'Cannot merge',
        body: 'Territories can only be merged with their own kind — all state-based, or all county-based.',
      });
      return;
    }

    const componentsKey = isCountyBased ? 'counties' : 'states';
    
    // Collect all components from selected territories
    const componentsToMerge = territoriesToMerge.flatMap(t => t[componentsKey] || []);
    
    // Merge into target territory
    const mergedComponents = [...new Set([
      ...targetTerritory[componentsKey],
      ...componentsToMerge
    ])];

    // Update territories
    setTerritories(prev => {
      const updated = prev.map(t => {
        if (t.id === targetTerritory.id) {
          // Update target territory with merged components
          const updatedTerritory = { ...t, [componentsKey]: mergedComponents };
          
          // Update SVG path and center
          if (isCountyBased && countyData) {
            const countyObjects = countyData.counties.filter(c => mergedComponents.includes(c.id));
            updatedTerritory.svgPath = combineCountyPaths(countyObjects);
            updatedTerritory.center = calculateCountyGroupCenter(countyObjects);
            updatedTerritory.name = countyObjects.map(c => c.name).join(' & ');
          } else if (!isCountyBased) {
            updatedTerritory.svgPath = combineStatePaths(mergedComponents);
            updatedTerritory.center = calculateGroupCenter(mergedComponents);
            const stateObjects = getStatesByAbbrs(mergedComponents);
            updatedTerritory.name = stateObjects.map(s => s.name).join(' & ');
          }
          
          return updatedTerritory;
        }
        return t;
      }).filter(t => !selectedTerritoryIds.includes(t.id)); // Remove merged territories

      return updated;
    });

    // Update selected counties/states
    if (isCountyBased) {
      setSelectedCounties(prev => {
        const updated = new Set(prev);
        componentsToMerge.forEach(c => updated.add(c));
        return updated;
      });
    } else {
      setSelectedStates(prev => {
        const updated = new Set(prev);
        componentsToMerge.forEach(s => updated.add(s));
        return updated;
      });
    }

    // Update the editing territory reference
    setEditingTerritoryComponents(prev => ({
      ...prev,
      [componentsKey]: mergedComponents
    }));

    // Clear selection
    setSelectedTerritoriesForMerge(new Set());
  };

  const handleMergeComponentsToTerritory = async () => {
    if (!editingTerritoryComponents || !mergeTargetTerritory || selectedComponentsForMerge.size === 0) {
      return;
    }

    const sourceTerritory = editingTerritoryComponents;
    const targetTerritory = territories.find(t => t.id === mergeTargetTerritory);

    if (!targetTerritory || sourceTerritory.id === targetTerritory.id) {
      await notice({
        title: 'Invalid merge target',
        body: 'The selected merge target is not a valid one.',
      });
      return;
    }

    // Determine if we're working with states or counties
    const isCountyBased = sourceTerritory.isCountyBased;
    const componentsKey = isCountyBased ? 'counties' : 'states';
    const selectedComponents = Array.from(selectedComponentsForMerge);

    // Remove selected components from source territory
    const remainingComponents = sourceTerritory[componentsKey].filter(
      c => !selectedComponents.includes(c)
    );

    // Add selected components to target territory
    const mergedComponents = [...new Set([
      ...targetTerritory[componentsKey],
      ...selectedComponents
    ])];

    // Update territories
    setTerritories(prevTerritories => {
      const updated = prevTerritories.map(t => {
        if (t.id === sourceTerritory.id) {
          // Update source territory
          if (remainingComponents.length === 0) {
            // Remove territory if no components left
            return null;
          }
          return { ...t, [componentsKey]: remainingComponents };
        } else if (t.id === targetTerritory.id) {
          // Update target territory with merged components
          const updatedTerritory = { ...t, [componentsKey]: mergedComponents };
          
          // Update SVG path and center
          if (isCountyBased && countyData) {
            const countyObjects = countyData.counties.filter(c => mergedComponents.includes(c.id));
            updatedTerritory.svgPath = combineCountyPaths(countyObjects);
            updatedTerritory.center = calculateCountyGroupCenter(countyObjects);
            updatedTerritory.name = countyObjects.map(c => c.name).join(' & ');
          } else if (!isCountyBased) {
            updatedTerritory.svgPath = combineStatePaths(mergedComponents);
            updatedTerritory.center = calculateGroupCenter(mergedComponents);
            const stateObjects = getStatesByAbbrs(mergedComponents);
            updatedTerritory.name = stateObjects.map(s => s.name).join(' & ');
          }
          
          return updatedTerritory;
        }
        return t;
      }).filter(Boolean); // Remove null entries (deleted territories)

      return updated;
    });

    // Update selected counties/states if source territory was deleted
    if (remainingComponents.length === 0) {
      if (isCountyBased) {
        setSelectedCounties(prev => {
          const updated = new Set(prev);
          selectedComponents.forEach(c => updated.delete(c));
          return updated;
        });
      } else {
        setSelectedStates(prev => {
          const updated = new Set(prev);
          selectedComponents.forEach(s => updated.delete(s));
          return updated;
        });
      }
    }

    // Close edit panel
    handleCloseEditComponents();
  };

  const handleReset = () => {
    setSelectedStates(new Set());
    setSelectedCounties(new Set());
    setTerritories([]);
    setEditingTerritory(null);
    setZoom(1);
    setPanX(0);
    setPanY(0);
  };

  const handleCountyClick = (county, ctrlKey = false) => {
    // Ignore clicks right after a drag
    if (justDragged) return;

    // If we're editing a territory, add this county to it
    if (editingTerritoryComponents && editingTerritoryComponents.isCountyBased) {
      const territory = editingTerritoryComponents;
      
      // Check if county is already in this territory
      if (territory.counties && territory.counties.includes(county.id)) {
        return; // Already in this territory
      }
      
      // Check if county is in another territory
      const existingTerritory = territories.find(t =>
        t.id !== territory.id && t.counties && t.counties.includes(county.id)
      );
      
      if (existingTerritory) {
        // County is in another territory - can't add directly
        return;
      }
      
      // Add county to the editing territory
      setTerritories(prev => prev.map(t => {
        if (t.id === territory.id) {
          const newCounties = [...(t.counties || []), county.id];
          const countyObjects = countyData.counties.filter(c => newCounties.includes(c.id));
          return {
            ...t,
            counties: newCounties,
            svgPath: combineCountyPaths(countyObjects),
            center: calculateCountyGroupCenter(countyObjects),
            name: countyObjects.map(c => c.name).join(' & ')
          };
        }
        return t;
      }));
      
      // Update selected counties
      setSelectedCounties(prev => new Set([...prev, county.id]));
      
      // Update the editing territory reference
      setEditingTerritoryComponents(prev => ({
        ...prev,
        counties: [...(prev.counties || []), county.id]
      }));
      
      return;
    }

    if (ctrlKey) {
      // Find territory containing this county
      const territory = territories.find(t => t.counties && t.counties.includes(county.id));

      if (territory && territory.counties.length > 1) {
        // Ctrl+Click on merged territory: Split it
        splitCountyTerritory(territory);
        setMultiSelectCounties(new Set());
      } else if (territory && territory.counties.length === 1) {
        // Ctrl+Click on existing single-county territory: Add ALL its counties to multi-select
        const newMultiSelect = new Set(multiSelectCounties);
        
        // Toggle all counties in this territory
        const hasAllCounties = territory.counties.every(c => newMultiSelect.has(c));
        if (hasAllCounties) {
          // Remove all counties from this territory
          territory.counties.forEach(c => newMultiSelect.delete(c));
        } else {
          // Add all counties from this territory
          territory.counties.forEach(c => newMultiSelect.add(c));
        }
        
        setMultiSelectCounties(newMultiSelect);
        
        // If we have counties from 2+ territories selected, merge them
        if (newMultiSelect.size >= 2) {
          mergeSelectedCounties(newMultiSelect);
        }
      } else if (!territory) {
        // Ctrl+Click on non-selected county: Select it first, then add to multi-select
        const newSelected = new Set(selectedCounties);
        newSelected.add(county.id);

        const newTerritory = {
          id: `territory-${Date.now()}`,
          name: county.name,
          counties: [county.id],
          victoryPoints: 1,
          maps: [],
          owner: 'NEUTRAL',
          initialOwner: 'NEUTRAL',
          isCountyBased: true
        };
        setTerritories([...territories, newTerritory]);
        setSelectedCounties(newSelected);

        // Add to multi-select
        const newMultiSelect = new Set(multiSelectCounties);
        newMultiSelect.add(county.id);
        setMultiSelectCounties(newMultiSelect);

        // If we have 2+ counties selected, merge them
        if (newMultiSelect.size >= 2) {
          mergeSelectedCounties(newMultiSelect);
        }
      } else {
        // Ctrl+Click on single county territory: Add to multi-select for merging
        const newMultiSelect = new Set(multiSelectCounties);

        if (newMultiSelect.has(county.id)) {
          newMultiSelect.delete(county.id);
        } else {
          newMultiSelect.add(county.id);
        }

        setMultiSelectCounties(newMultiSelect);

        // If we have 2+ counties selected, merge them
        if (newMultiSelect.size >= 2) {
          mergeSelectedCounties(newMultiSelect);
        }
      }
    } else {
      // Normal click: toggle county selection
      const newSelected = new Set(selectedCounties);

      if (newSelected.has(county.id)) {
        // Deselect county
        newSelected.delete(county.id);
        // Remove from territories
        setTerritories(territories.filter(t => !t.counties || !t.counties.includes(county.id)));
      } else {
        // Select county
        newSelected.add(county.id);

        // Create a new territory for this county
        const newTerritory = {
          id: `territory-${Date.now()}`,
          name: county.name,
          counties: [county.id],
          victoryPoints: 1,
          maps: [],
          owner: 'NEUTRAL',
          initialOwner: 'NEUTRAL',
          isCountyBased: true
        };
        setTerritories([...territories, newTerritory]);
      }

      setSelectedCounties(newSelected);
      setMultiSelectCounties(new Set()); // Clear multi-select on normal click
    }
  };

  const mergeSelectedCounties = (countiesToMerge) => {
    const countyArray = Array.from(countiesToMerge);

    // Use callback to work with latest state
    setTerritories(prev => {
      // Find all territories that contain these counties
      const affectedTerritories = prev.filter(t =>
        t.counties && t.counties.some(c => countyArray.includes(c))
      );

      if (affectedTerritories.length === 0) return prev;

      // Collect all counties from affected territories
      const allCounties = [...new Set(affectedTerritories.flatMap(t => t.counties))];

      // Create merged territory
      const mergedName = affectedTerritories.map(t => t.name).join(' & ');
      const mergedTerritory = {
        id: `territory-${Date.now()}`,
        name: mergedName,
        counties: allCounties,
        victoryPoints: Math.max(...affectedTerritories.map(t => t.victoryPoints)),
        maps: [...new Set(affectedTerritories.flatMap(t => t.maps || []))],
        owner: affectedTerritories[0].owner || affectedTerritories[0].initialOwner,
        initialOwner: affectedTerritories[0].owner || affectedTerritories[0].initialOwner,
        isCountyBased: true
      };

      // Remove old territories and add merged one
      const remainingTerritories = prev.filter(t => !affectedTerritories.includes(t));
      return [...remainingTerritories, mergedTerritory];
    });
  };

  const splitCountyTerritory = (territory) => {
    // Remove the merged territory
    const remainingTerritories = territories.filter(t => t.id !== territory.id);

    // Create individual territories for each county
    const countyObjects = countyData.counties.filter(c => territory.counties.includes(c.id));
    const newTerritories = countyObjects.map(county => ({
      id: `territory-${Date.now()}-${county.id}`,
      name: county.name,
      counties: [county.id],
      victoryPoints: 1,
      maps: [],
      owner: territory.owner || territory.initialOwner,
      initialOwner: territory.owner || territory.initialOwner,
      isCountyBased: true
    }));

    setTerritories([...remainingTerritories, ...newTerritories]);
  };

  const handleSave = async () => {
    if (territories.length < 2) {
      await notice({
        title: 'Too few territories',
        body: 'Create at least two territories for the campaign.',
      });
      return;
    }

    // Filter territories based on current mode and update SVG paths and centers
    const modifiedTerritories = territories
      .filter(t => {
        // In county mode, only save county-based territories
        if (isCountyMode) {
          return t.isCountyBased && t.counties && t.counties.length > 0;
        }
        // In state mode, only save state-based territories
        return !t.isCountyBased && t.states && t.states.length > 0;
      })
      .map(t => {
        // Update SVG path and center for state-based territories
        if (t.states && t.states.length > 0) {
          return {
            ...t,
            svgPath: combineStatePaths(t.states),
            center: calculateGroupCenter(t.states),
            // Ensure both victoryPoints and pointValue exist
            victoryPoints: t.victoryPoints,
            pointValue: t.victoryPoints,
            // adjacentTerritories will be auto-calculated on import/export
            adjacentTerritories: []
          };
        }
        // Update SVG path and center for county-based territories
        if (t.counties && t.counties.length > 0 && countyData) {
          const countyObjects = countyData.counties.filter(c => t.counties.includes(c.id));
          return {
            ...t,
            svgPath: combineCountyPaths(countyObjects),
            center: calculateCountyGroupCenter(countyObjects),
            // Store individual county paths for rendering each county separately on the map
            countyPaths: countyObjects.map(c => ({
              id: c.id,
              name: c.name,
              svgPath: c.svgPath
            })),
            // Ensure both victoryPoints and pointValue exist
            victoryPoints: t.victoryPoints,
            pointValue: t.victoryPoints,
            // adjacentTerritories will be auto-calculated on import/export
            adjacentTerritories: []
          };
        }
        // Otherwise preserve existing SVG path and center
        return {
          ...t,
          // Ensure both victoryPoints and pointValue exist
          victoryPoints: t.victoryPoints,
          pointValue: t.victoryPoints,
          // adjacentTerritories will be auto-calculated on import/export
          adjacentTerritories: t.adjacentTerritories || []
        };
      });

    if (modifiedTerritories.length < 2) {
      await notice({
        title: 'Too few territories',
        body: 'Create at least two territories for the campaign.',
      });
      return;
    }

    onSave(modifiedTerritories);
  };

  const handleMapModeToggle = () => {
    const newMode = mapMode === 'states' ? 'counties' : 'states';
    setMapMode(newMode);

    if (newMode === 'counties') {
      // Show state selector modal
      setShowStateSelector(true);
    } else {
      // Switch back to states mode - clear all territories and selections
      setIsCountyMode(false);
      setCountyData(null);
      setSelectedStatesForCounties(new Set());
      setTerritories([]);
      setSelectedStates(new Set());
      setSelectedCounties(new Set());
    }
  };

  const handleStateSelectionConfirm = async () => {
    if (selectedStatesForCounties.size === 0) {
      await notice({
        title: 'Choose a state',
        body: 'Select at least one state.',
      });
      return;
    }

    try {
      // Load county data for selected states
      const stateAbbrs = Array.from(selectedStatesForCounties);
      const countyDataForStates = await getCountiesForStates(stateAbbrs);

      setCountyData(countyDataForStates);
      setIsCountyMode(true);
      setShowStateSelector(false);

      // Clear existing territories and reset selection
      setTerritories([]);
      setSelectedStates(new Set());
    } catch (error) {
      console.error('Error loading county data:', error);
      await notice({
        title: 'Could not load county data',
        body: 'The county data did not load. Try again.',
      });
    }
  };

  const handleStateSelectionCancel = () => {
    setShowStateSelector(false);
    setMapMode('states'); // Reset back to states mode
    setSelectedStatesForCounties(new Set());
  };

  const toggleStateForCounties = (stateAbbr) => {
    const newSelection = new Set(selectedStatesForCounties);
    if (newSelection.has(stateAbbr)) {
      newSelection.delete(stateAbbr);
    } else {
      newSelection.add(stateAbbr);
    }
    setSelectedStatesForCounties(newSelection);
  };

  // Zoom and pan handlers
  const handleWheel = (e) => {
    // Only zoom if shift is held
    if (e.shiftKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.5, Math.min(5, zoom * delta));
      setZoom(newZoom);
    }
  };

  const handleMouseDown = (e) => {
    // Pan with middle mouse button or shift + left click
    const shouldPan = e.button === 1 || (e.button === 0 && e.shiftKey);
    if (shouldPan) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - panX, y: e.clientY - panY });
      return;
    }

    // Start drag selection with left click
    if (e.button === 0) {
      if (e.ctrlKey || e.metaKey) {
        // Ctrl+drag for merging
        setIsDraggingMerge(true);
      } else {
        // Normal drag for selecting
        setIsDraggingSelect(true);
      }
      setDraggedItems(new Set());
    }
  };

  const handleMouseMove = (e) => {
    if (isPanning) {
      setPanX(e.clientX - panStart.x);
      setPanY(e.clientY - panStart.y);
    }
    // Drag selection is handled in individual state/county mouseEnter handlers
  };

  const handleMouseUp = () => {
    setIsPanning(false);

    // Finalize drag selection or merge
    if ((isDraggingSelect || isDraggingMerge) && draggedItems.size > 0) {
      finalizeDragSelection();
      setJustDragged(true);
      // Clear the flag after a short delay to allow click events to be ignored
      setTimeout(() => setJustDragged(false), 100);
    }
    setIsDraggingSelect(false);
    setIsDraggingMerge(false);
    setDraggedItems(new Set());
  };

  const finalizeDragSelection = () => {
    const itemsArray = Array.from(draggedItems);

    if (isCountyMode) {
      // Handle county drag selection
      if (isDraggingMerge && itemsArray.length > 1) {
        // Ctrl+drag: Create a single merged territory directly
        const newCounties = [];
        const countyObjects = [];

        itemsArray.forEach(countyId => {
          const county = countyData.counties.find(c => c.id === countyId);
          if (county && !selectedCounties.has(countyId)) {
            newCounties.push(countyId);
            countyObjects.push(county);
          }
        });

        if (newCounties.length > 1) {
          // Create a single merged territory
          const mergedName = countyObjects.map(c => c.name).join(' & ');
          const mergedTerritory = {
            id: `territory-${Date.now()}-merged`,
            name: mergedName,
            counties: newCounties,
            victoryPoints: 1,
            maps: [],
            owner: 'NEUTRAL',
            initialOwner: 'NEUTRAL',
            isCountyBased: true
          };

          // Update selected counties
          setSelectedCounties(prev => {
            const updated = new Set(prev);
            newCounties.forEach(id => updated.add(id));
            return updated;
          });

          // Use callback to work with latest state
          setTerritories(prev => {
            // Find any existing territories that contain these counties
            const affectedTerritories = prev.filter(t =>
              t.counties && t.counties.some(c => newCounties.includes(c))
            );

            // Collect all counties from affected territories plus new ones
            const allCounties = [...new Set([
              ...affectedTerritories.flatMap(t => t.counties),
              ...newCounties
            ])];

            // If there are existing territories, merge with them
            if (affectedTerritories.length > 0) {
              const allCountyObjects = countyData.counties.filter(c => allCounties.includes(c.id));
              const finalMergedName = allCountyObjects.map(c => c.name).join(' & ');
              const finalMergedTerritory = {
                id: `territory-${Date.now()}-merged`,
                name: finalMergedName,
                counties: allCounties,
                victoryPoints: Math.max(...affectedTerritories.map(t => t.victoryPoints), 1),
                maps: [...new Set(affectedTerritories.flatMap(t => t.maps || []))],
                owner: affectedTerritories[0].owner || 'NEUTRAL',
                initialOwner: affectedTerritories[0].initialOwner || 'NEUTRAL',
                isCountyBased: true
              };

              // Remove affected territories and add the merged one
              return [...prev.filter(t => !affectedTerritories.includes(t)), finalMergedTerritory];
            } else {
              // No existing territories, just add the new merged one
              return [...prev, mergedTerritory];
            }
          });

          setMultiSelectCounties(new Set(newCounties));
        }
      } else {
        // Normal drag: Create individual territories
        const newCounties = [];
        const newTerritories = [];

        itemsArray.forEach(countyId => {
          const county = countyData.counties.find(c => c.id === countyId);
          if (county && !selectedCounties.has(countyId)) {
            newCounties.push(countyId);

            const newTerritory = {
              id: `territory-${Date.now()}-${Math.random()}-${countyId}`,
              name: county.name,
              counties: [countyId],
              victoryPoints: 1,
              maps: [],
              owner: 'NEUTRAL',
              initialOwner: 'NEUTRAL',
              isCountyBased: true
            };
            newTerritories.push(newTerritory);
          }
        });

        if (newCounties.length > 0) {
          setSelectedCounties(prev => {
            const updated = new Set(prev);
            newCounties.forEach(id => updated.add(id));
            return updated;
          });
          setTerritories(prev => [...prev, ...newTerritories]);
        }
      }
    } else {
      // Handle state drag selection
      if (isDraggingMerge && itemsArray.length > 1) {
        // Ctrl+drag: Create a single merged territory directly
        const newStates = [];
        const stateObjects = [];

        itemsArray.forEach(stateAbbr => {
          if (!selectedStates.has(stateAbbr)) {
            const state = usaStates.find(s => s.abbreviation === stateAbbr);
            if (state) {
              newStates.push(stateAbbr);
              stateObjects.push(state);
            }
          }
        });

        if (newStates.length > 1) {
          // Create a single merged territory
          const mergedName = stateObjects.map(s => s.name).join(' & ');
          const mergedTerritory = {
            id: `territory-${Date.now()}-merged`,
            name: mergedName,
            states: newStates,
            victoryPoints: 1,
            maps: [],
            owner: 'NEUTRAL',
            initialOwner: 'NEUTRAL',
            svgPath: combineStatePaths(newStates),
            center: calculateGroupCenter(newStates)
          };

          // Update selected states
          setSelectedStates(prev => {
            const updated = new Set(prev);
            newStates.forEach(abbr => updated.add(abbr));
            return updated;
          });

          // Use callback to work with latest state
          setTerritories(prev => {
            // Find any existing territories that contain these states
            const affectedTerritories = prev.filter(t =>
              t.states && t.states.some(s => newStates.includes(s))
            );

            // Collect all states from affected territories plus new ones
            const allStates = [...new Set([
              ...affectedTerritories.flatMap(t => t.states),
              ...newStates
            ])];

            // If there are existing territories, merge with them
            if (affectedTerritories.length > 0) {
              const allStateObjects = getStatesByAbbrs(allStates);
              const finalMergedName = allStateObjects.map(s => s.name).join(' & ');
              const finalMergedTerritory = {
                id: `territory-${Date.now()}-merged`,
                name: finalMergedName,
                states: allStates,
                victoryPoints: Math.max(...affectedTerritories.map(t => t.victoryPoints), 1),
                maps: [...new Set(affectedTerritories.flatMap(t => t.maps || []))],
                owner: affectedTerritories[0].owner || 'NEUTRAL',
                initialOwner: affectedTerritories[0].initialOwner || 'NEUTRAL',
                svgPath: combineStatePaths(allStates),
                center: calculateGroupCenter(allStates)
              };

              // Remove affected territories and add the merged one
              return [...prev.filter(t => !affectedTerritories.includes(t)), finalMergedTerritory];
            } else {
              // No existing territories, just add the new merged one
              return [...prev, mergedTerritory];
            }
          });

          setMultiSelectStates(new Set(newStates));
        }
      } else {
        // Normal drag: Create individual territories
        const newStates = [];
        const newTerritories = [];

        itemsArray.forEach(stateAbbr => {
          if (!selectedStates.has(stateAbbr)) {
            const state = usaStates.find(s => s.abbreviation === stateAbbr);
            if (state) {
              newStates.push(stateAbbr);

              const newTerritory = {
                id: `territory-${Date.now()}-${Math.random()}-${stateAbbr}`,
                name: state.name,
                states: [stateAbbr],
                victoryPoints: 1,
                maps: [],
                owner: 'NEUTRAL',
                initialOwner: 'NEUTRAL',
                svgPath: state.svgPath,
                center: state.center
              };
              newTerritories.push(newTerritory);
            }
          }
        });

        if (newStates.length > 0) {
          setSelectedStates(prev => {
            const updated = new Set(prev);
            newStates.forEach(abbr => updated.add(abbr));
            return updated;
          });
          setTerritories(prev => [...prev, ...newTerritories]);
        }
      }
    }
  };

  if (!isOpen) return null;

  // Ground on the plate: a side's wash once a territory has been drawn on it,
  // rust for ground picked but not yet assigned, bare paper for the rest.
  const groundFill = (owner, isSelected) => {
    if (!isSelected) return 'var(--color-paper-3)';
    if (owner === 'USA') return 'var(--color-union-wash)';
    if (owner === 'CSA') return 'var(--color-rebel-wash)';
    if (owner === 'NEUTRAL') return 'var(--color-neutral-wash)';
    return 'var(--color-mark)';
  };

  /** One line in a pick-list: bold and ticked when it is in the selection. */
  const pickLine = (key, picked, onClick, children) => (
    <button
      key={key}
      onClick={onClick}
      className="flex w-full items-baseline gap-2 border-b border-paper-3 py-1 text-left text-sm last:border-b-0 hover:bg-paper-2"
    >
      <span className="w-3 shrink-0 text-ink-3">{picked ? '✓' : ''}</span>
      <span className={picked ? 'font-bold' : 'text-ink-2'}>{children}</span>
    </button>
  );

  const instructions = isCountyMode
    ? [
      <>Click counties to take them up or put them back.</>,
      <><b className="not-italic text-ink">Click and drag</b> to take up several at once.</>,
      <><b className="not-italic text-ink">Ctrl + click and drag</b> to take up and merge into one territory.</>,
      <>Ctrl + click counties to merge them into one territory (two or more).</>,
      <>Ctrl + click a merged territory to break it back into its counties.</>,
      <>Counties are washed in the colour of whoever holds them; rust is ground not yet assigned.</>,
      <><b className="not-italic text-ink">Shift + scroll</b> to zoom, <b className="not-italic text-ink">shift + drag</b> to pan.</>,
      <>Set each territory up in the register alongside.</>,
    ]
    : [
      <>Click states to take them up or put them back.</>,
      <><b className="not-italic text-ink">Click and drag</b> to take up several at once.</>,
      <><b className="not-italic text-ink">Ctrl + click and drag</b> to take up and merge into one territory.</>,
      <>Ctrl + click states to merge them into one territory (two or more).</>,
      <>Ctrl + click a merged territory to break it back into its states.</>,
      <>States are washed in the colour of whoever holds them; rust is ground not yet assigned.</>,
      <><b className="not-italic text-ink">Shift + scroll</b> to zoom, <b className="not-italic text-ink">shift + drag</b> to pan.</>,
      <>Set each territory up in the register alongside.</>,
    ];

  return (
    <>
      <Modal
        dismissible={false}
        title="The map editor"
        subtitle="Choose the ground: take up states or counties on the plate, then group them into territories."
        width="max-w-7xl"
        onClose={onClose}
        footer={
          <>
            <button
              onClick={handleSave}
              disabled={territories.length < 2}
              className="ui-btn ui-btn-primary flex-1"
            >
              Save custom map
            </button>
            <button onClick={handleReset} className="ui-btn">
              Reset all
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-6 lg:h-[64dvh] lg:flex-row lg:overflow-hidden">
          {/* ---------- The plate ---------- */}
          <div className="flex min-w-0 flex-1 flex-col gap-3 lg:overflow-hidden">
            <div className="ui-plate flex min-h-[18rem] flex-1">
              <div className="ui-plate-inner flex min-w-0 flex-1 items-center justify-center">
                <svg
                  viewBox={isCountyMode && countyData ? countyData.viewBox : "0 0 1000 589"}
                  className="w-full h-full"
                  style={{
                    maxHeight: '100%',
                    maxWidth: '100%',
                    cursor: isPanning ? 'grabbing' : (isDraggingSelect || isDraggingMerge) ? 'crosshair' : 'default'
                  }}
                  onWheel={handleWheel}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                >
                  <g transform={`translate(${panX}, ${panY}) scale(${zoom})`}>
                    {/* Counties or states, by mode */}
                    {isCountyMode && countyData ? (
                      <>
                        {countyData.counties.length > 0 ? (
                          <>
                            {countyData.counties.map(county => {
                              const isSelected = selectedCounties.has(county.id);
                              const isHovered = hoveredCounty === county.id;
                              const isMultiSelected = multiSelectCounties.has(county.id);

                              // Find territory that owns this county
                              const owningTerritory = territories.find(t =>
                                t.counties && t.counties.includes(county.id)
                              );
                              const owner = owningTerritory?.owner || owningTerritory?.initialOwner;

                              return (
                                <path
                                  key={county.id}
                                  d={county.svgPath}
                                  fillOpacity={isSelected ? 0.6 : 0.3}
                                  strokeWidth={isMultiSelected ? '3' : '0.2'}
                                  className="cursor-pointer transition-all duration-200"
                                  style={{
                                    fill: groundFill(owner, isSelected),
                                    stroke: isMultiSelected ? 'var(--color-ink)' : 'var(--color-rule)',
                                    filter: isHovered ? 'brightness(0.92)' : 'none'
                                  }}
                                  onClick={(e) => handleCountyClick(county, e.ctrlKey || e.metaKey)}
                                  onMouseEnter={() => {
                                    setHoveredCounty(county.id);
                                    // Add to drag selection if dragging
                                    if (isDraggingSelect || isDraggingMerge) {
                                      setDraggedItems(prev => new Set([...prev, county.id]));
                                    }
                                  }}
                                  onMouseLeave={() => setHoveredCounty(null)}
                                />
                              );
                            })}
                          </>
                        ) : (
                          <text
                            x="500" y="300"
                            textAnchor="middle"
                            fontSize="18"
                            fontStyle="italic"
                            style={{ fill: 'var(--color-ink-3)' }}
                          >
                            No county data for the states chosen
                          </text>
                        )}
                      </>
                    ) : (
                      usaStates.map(state => {
                        const isSelected = selectedStates.has(state.abbreviation);
                        const isHovered = hoveredState === state.abbreviation;
                        const isMultiSelected = multiSelectStates.has(state.abbreviation);

                        // Find territory that owns this state to determine colour
                        const owningTerritory = territories.find(t =>
                          t.states && t.states.includes(state.abbreviation)
                        );
                        const owner = owningTerritory?.owner || owningTerritory?.initialOwner;

                        return (
                          <path
                            key={state.abbreviation}
                            d={state.svgPath}
                            fillOpacity={isSelected ? 0.6 : 0.3}
                            strokeWidth={isMultiSelected ? '3' : '1'}
                            className="cursor-pointer transition-all duration-200"
                            style={{
                              fill: groundFill(owner, isSelected),
                              stroke: isMultiSelected ? 'var(--color-ink)' : 'var(--color-rule)',
                              filter: isHovered ? 'brightness(0.92)' : 'none'
                            }}
                            onClick={(e) => handleStateClick(state.abbreviation, e.ctrlKey || e.metaKey)}
                            onMouseEnter={() => {
                              setHoveredState(state.abbreviation);
                              // Add to drag selection if dragging
                              if (isDraggingSelect || isDraggingMerge) {
                                setDraggedItems(prev => new Set([...prev, state.abbreviation]));
                              }
                            }}
                            onMouseLeave={() => setHoveredState(null)}
                          />
                        );
                      })
                    )}
                  </g>
                </svg>
              </div>
            </div>

            <p className="ui-caption">
              <b>{isCountyMode ? 'County view' : 'State view'}</b> — {territories.length}{' '}
              {territories.length === 1 ? 'territory' : 'territories'} drawn
            </p>

            <div className="ui-box">
              <div className="ui-eyebrow mb-1">Working the plate</div>
              <ul className="ui-hint list-disc space-y-0.5 pl-4">
                {instructions.map((line, i) => <li key={i}>{line}</li>)}
              </ul>
            </div>
          </div>

          {/* ---------- The register ---------- */}
          <div className="ui-scroll w-full shrink-0 lg:w-96 lg:overflow-y-auto lg:pl-6 lg:border-l lg:border-rule">
            <SectionHead
              title="Territories"
              meta={`${territories.length} drawn`}
            />

            <p className="ui-hint">
              {isCountyMode
                ? `${selectedCounties.size} counties taken up (${Array.from(selectedStatesForCounties).join(', ')})`
                : `${selectedStates.size} states taken up`}
            </p>

            {/* What the plate shows */}
            <div className="mt-3">
              <div className="ui-eyebrow mb-1">The plate shows</div>
              <div className="ui-segment">
                <button
                  onClick={() => { if (mapMode !== 'states') handleMapModeToggle(); }}
                  data-active={mapMode === 'states'}
                >
                  States
                </button>
                <button
                  onClick={() => { if (mapMode !== 'counties') handleMapModeToggle(); }}
                  data-active={mapMode === 'counties'}
                >
                  Counties
                </button>
              </div>
              <p className="ui-hint mt-1">
                {mapMode === 'states'
                  ? 'Switch to counties to draw finer ground.'
                  : 'Switching back to states clears the board.'}
              </p>
            </div>

            {/* The territories themselves */}
            <div className="mt-4 space-y-4">
              {territories.length === 0 ? (
                <EmptyState
                  title="No territories yet"
                  hint="Click ground on the plate to begin."
                />
              ) : (
                territories.map((territory) => (
                  <div key={territory.id} className="ui-box">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <input
                          type="text"
                          value={territory.name}
                          onChange={(e) => handleTerritoryUpdate(territory.id, 'name', e.target.value)}
                          className="ui-field font-bold"
                          placeholder="Territory name"
                        />
                        <p className="ui-hint mt-1">
                          {territory.isCountyBased
                            ? (() => {
                              const countyNames = territory.counties
                                ?.map(cId => countyData?.counties.find(c => c.id === cId)?.name)
                                .filter(Boolean) || [];
                              return `Counties (${countyNames.length}): ${countyNames.join(', ')}`;
                            })()
                            : `States (${territory.states?.length || 0}): ${territory.states ? territory.states.join(', ') : 'N/A'}`}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          if (editingTerritoryComponents?.id === territory.id) {
                            handleCloseEditComponents();
                          } else {
                            handleEditTerritoryComponents(territory);
                          }
                        }}
                        className={`ui-btn ui-btn-icon ui-btn-sm shrink-0 ${
                          editingTerritoryComponents?.id === territory.id ? 'ui-btn-primary' : ''
                        }`}
                        title={editingTerritoryComponents?.id === territory.id ? 'Close edit mode' : 'Edit territory components'}
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteTerritory(territory.id)}
                        className="ui-btn ui-btn-icon ui-btn-sm ui-btn-danger shrink-0"
                        title="Delete territory"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Victory points */}
                    <div className="mt-3">
                      <label className="ui-label">
                        Victory points — <span className="font-bold text-ink tabular">{territory.victoryPoints}</span>
                      </label>
                      <input
                        type="range"
                        min="1"
                        max="20"
                        value={territory.victoryPoints}
                        onChange={(e) => handleTerritoryUpdate(territory.id, 'victoryPoints', parseInt(e.target.value))}
                        className="w-full accent-ink"
                      />
                    </div>

                    {/* Who holds it */}
                    <div className="mt-2">
                      <label className="ui-label">Held by</label>
                      <select
                        value={territory.owner || territory.initialOwner}
                        onChange={(e) => {
                          // Update both owner and initialOwner in one operation
                          setTerritories(territories.map(t =>
                            t.id === territory.id
                              ? { ...t, owner: e.target.value, initialOwner: e.target.value }
                              : t
                          ));
                        }}
                        className="ui-field"
                      >
                        <option value="USA">USA</option>
                        <option value="CSA">CSA</option>
                        <option value="NEUTRAL">Neutral</option>
                      </select>
                    </div>

                    {/* Water access — what the Anaconda Plan and a landing reach */}
                    <label className="mt-2 flex cursor-pointer items-center gap-2 border-b border-paper-3 py-2">
                      <input
                        type="checkbox"
                        checked={!!territory.hasWaterAccess}
                        onChange={(e) => handleTerritoryUpdate(territory.id, 'hasWaterAccess', e.target.checked)}
                        className="h-4 w-4 accent-ink"
                      />
                      <span className="font-bold">Water access (coast or major river)</span>
                    </label>

                    {/* Urban */}
                    <label className="flex cursor-pointer items-center gap-2 border-b border-paper-3 py-2">
                      <input
                        type="checkbox"
                        checked={!!territory.isUrban}
                        onChange={(e) => handleTerritoryUpdate(territory.id, 'isUrban', e.target.checked)}
                        className="h-4 w-4 accent-ink"
                      />
                      <span className="font-bold">Urban</span>
                    </label>

                    {/* Maps fought over it */}
                    <div className="mt-2">
                      <label className="ui-label">Assigned maps</label>
                      <select
                        multiple
                        value={territory.maps}
                        onChange={(e) => {
                          const selected = Array.from(e.target.selectedOptions, option => option.value);
                          handleTerritoryUpdate(territory.id, 'maps', selected);
                        }}
                        className="ui-field h-32"
                      >
                        {Object.entries(mapsByMapset).map(([mapset, maps]) => (
                          <optgroup key={mapset} label={mapset}>
                            {maps.map(map => (
                              <option key={map} value={map}>{map}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      <p className="ui-hint mt-1">Hold Ctrl or Cmd to pick more than one.</p>
                    </div>

                    {/* Editing the parts this territory is made of */}
                    {editingTerritoryComponents?.id === territory.id && (
                      <div className="mt-3 border-t border-rule pt-3">
                        <div className="ui-eyebrow">Edit mode</div>
                        <p className="ui-hint">
                          Click any unassigned {territory.isCountyBased ? 'county' : 'state'} on the
                          plate to add it to this territory.
                        </p>

                        {/* Move components to another territory */}
                        {((territory.isCountyBased && territory.counties?.length > 1) ||
                          (!territory.isCountyBased && territory.states?.length > 1)) && (
                          <div className="mt-3">
                            <div className="ui-eyebrow mb-1">Move parts to another territory</div>

                            <div className="ui-scroll max-h-32">
                              {territory.isCountyBased
                                ? territory.counties?.map(countyId => {
                                  const county = countyData?.counties.find(c => c.id === countyId);
                                  if (!county) return null;
                                  return pickLine(
                                    countyId,
                                    selectedComponentsForMerge.has(countyId),
                                    () => toggleComponentSelection(countyId),
                                    county.name
                                  );
                                })
                                : territory.states?.map(stateAbbr => {
                                  const state = usaStates.find(s => s.abbreviation === stateAbbr);
                                  if (!state) return null;
                                  return pickLine(
                                    stateAbbr,
                                    selectedComponentsForMerge.has(stateAbbr),
                                    () => toggleComponentSelection(stateAbbr),
                                    `${state.abbreviation} — ${state.name}`
                                  );
                                })}
                            </div>

                            {selectedComponentsForMerge.size > 0 && (
                              <>
                                <select
                                  value={mergeTargetTerritory || ''}
                                  onChange={(e) => setMergeTargetTerritory(e.target.value)}
                                  className="ui-field mt-2 text-sm"
                                >
                                  <option value="">Move to…</option>
                                  {territories
                                    .filter(t =>
                                      t.id !== territory.id &&
                                      t.isCountyBased === territory.isCountyBased
                                    )
                                    .map(t => (
                                      <option key={t.id} value={t.id}>{t.name}</option>
                                    ))}
                                </select>
                                <button
                                  onClick={handleMergeComponentsToTerritory}
                                  disabled={!mergeTargetTerritory}
                                  className="ui-btn ui-btn-sm ui-btn-block mt-2"
                                >
                                  Move {selectedComponentsForMerge.size} selected
                                </button>
                              </>
                            )}
                          </div>
                        )}

                        {/* Merge whole territories into this one */}
                        <div className="mt-3">
                          <div className="ui-eyebrow mb-1">Merge other territories into this one</div>

                          <div className="ui-scroll max-h-32">
                            {territories
                              .filter(t =>
                                t.id !== territory.id &&
                                t.isCountyBased === territory.isCountyBased
                              )
                              .map(t => pickLine(
                                t.id,
                                selectedTerritoriesForMerge.has(t.id),
                                () => toggleTerritorySelection(t.id),
                                <>
                                  {t.name}
                                  <span className="text-ink-3">
                                    {' · '}
                                    {t.isCountyBased
                                      ? `${t.counties?.length || 0} counties`
                                      : `${t.states?.length || 0} states`}
                                  </span>
                                </>
                              ))}
                          </div>

                          {selectedTerritoriesForMerge.size > 0 && (
                            <button
                              onClick={handleMergeTerritoriesIntoEditing}
                              className="ui-btn ui-btn-sm ui-btn-block mt-2"
                            >
                              Merge {selectedTerritoriesForMerge.size}{' '}
                              {selectedTerritoriesForMerge.size === 1 ? 'territory' : 'territories'}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* ---------- Choosing the states a county map is drawn from ---------- */}
      {showStateSelector && (
        <Modal
          dismissible={false}
          title="Counties — choose the states"
          subtitle="The counties of every state chosen are loaded into one editable plate."
          width="max-w-2xl"
          onClose={handleStateSelectionCancel}
          footer={
            <>
              <button
                onClick={handleStateSelectionConfirm}
                disabled={selectedStatesForCounties.size === 0}
                className="ui-btn ui-btn-primary flex-1"
              >
                Load counties ({selectedStatesForCounties.size})
              </button>
              <button onClick={handleStateSelectionCancel} className="ui-btn flex-1">
                Cancel
              </button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {usaStates.map(state => (
              <button
                key={state.abbreviation}
                onClick={() => toggleStateForCounties(state.abbreviation)}
                className={`ui-btn justify-start ${
                  selectedStatesForCounties.has(state.abbreviation) ? 'ui-btn-primary' : ''
                }`}
              >
                <span className="truncate">
                  {state.abbreviation} <span className="opacity-75">{state.name}</span>
                </span>
              </button>
            ))}
          </div>

          {selectedStatesForCounties.size > 0 && (
            <p className="ui-hint mt-3">
              {selectedStatesForCounties.size}{' '}
              {selectedStatesForCounties.size === 1 ? 'state' : 'states'} chosen:{' '}
              <b className="not-italic text-ink">
                {Array.from(selectedStatesForCounties).join(', ')}
              </b>
            </p>
          )}
        </Modal>
      )}
    </>
  );
};

export default MapEditor;
